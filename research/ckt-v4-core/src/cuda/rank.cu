#include <cuda_runtime.h>
#include <thrust/device_ptr.h>
#include <thrust/execution_policy.h>
#include <thrust/functional.h>
#include <thrust/iterator/constant_iterator.h>
#include <thrust/scan.h>
#include <thrust/sort.h>
#include <cstdint>
#include <cstdio>
#include <exception>
#include <new>

namespace {
constexpr unsigned PRIORITY_BITS = 23;

struct BatchEntry {
    std::uint64_t group;
    std::uint32_t priority;
    std::uint32_t index;
};

struct BatchEntryLess {
    __host__ __device__ bool operator()(const BatchEntry& left, const BatchEntry& right) const {
        return left.group < right.group
            || (left.group == right.group && left.priority < right.priority);
    }
};

struct Workspace {
    std::size_t capacity = 0;
    std::uint64_t* groups = nullptr;
    std::uint64_t* keys = nullptr;
    std::uint32_t* priorities = nullptr;
    std::uint32_t* indices = nullptr;
    std::uint32_t* sorted_ranks = nullptr;
    std::uint32_t* ranks = nullptr;
    BatchEntry* batch_entries = nullptr;

    void release() {
        cudaFree(groups);
        cudaFree(keys);
        cudaFree(priorities);
        cudaFree(indices);
        cudaFree(sorted_ranks);
        cudaFree(ranks);
        cudaFree(batch_entries);
        groups = nullptr;
        keys = nullptr;
        priorities = nullptr;
        indices = nullptr;
        sorted_ranks = nullptr;
        ranks = nullptr;
        batch_entries = nullptr;
        capacity = 0;
    }

    ~Workspace() { release(); }
};

__global__ void pack_keys(const std::uint64_t* groups,
                          const std::uint32_t* priorities,
                          std::uint64_t* keys,
                          std::uint32_t* indices,
                          std::size_t length) {
    const auto index = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (index < length) {
        keys[index] = (groups[index] << PRIORITY_BITS) | priorities[index];
        indices[index] = static_cast<std::uint32_t>(index);
    }
}

__global__ void pack_batch_entries(const std::uint64_t* groups,
                                   const std::uint32_t* priorities,
                                   BatchEntry* entries,
                                   std::size_t length) {
    const auto index = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (index < length) {
        entries[index] = BatchEntry{
            groups[index], priorities[index], static_cast<std::uint32_t>(index)};
    }
}

__global__ void extract_groups(const std::uint64_t* keys,
                               std::uint64_t* groups,
                               std::size_t length) {
    const auto index = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (index < length) groups[index] = keys[index] >> PRIORITY_BITS;
}

__global__ void extract_batch_groups(const BatchEntry* entries,
                                     std::uint64_t* groups,
                                     std::size_t length) {
    const auto index = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (index < length) groups[index] = entries[index].group;
}

__global__ void scatter_ranks(const std::uint32_t* indices,
                              const std::uint32_t* sorted_ranks,
                              std::uint32_t* ranks,
                              std::size_t length) {
    const auto index = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (index < length) ranks[indices[index]] = sorted_ranks[index];
}

__global__ void scatter_batch_ranks(const BatchEntry* entries,
                                    const std::uint32_t* sorted_ranks,
                                    std::uint32_t* ranks,
                                    std::size_t length) {
    const auto index = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (index < length) ranks[entries[index].index] = sorted_ranks[index];
}

int fail(cudaError_t error, char* message, std::size_t capacity) {
    if (message != nullptr && capacity > 0) {
        std::snprintf(message, capacity, "%s", cudaGetErrorString(error));
    }
    return static_cast<int>(error);
}

int allocate(void** pointer, std::size_t bytes, char* message, std::size_t message_capacity) {
    const auto error = cudaMalloc(pointer, bytes);
    return error == cudaSuccess ? 0 : fail(error, message, message_capacity);
}

int ensure_capacity(Workspace* workspace,
                    std::size_t required,
                    char* message,
                    std::size_t message_capacity) {
    if (required <= workspace->capacity) return 0;
    workspace->release();
    if (allocate(reinterpret_cast<void**>(&workspace->groups), required * sizeof(*workspace->groups), message, message_capacity) != 0
        || allocate(reinterpret_cast<void**>(&workspace->keys), required * sizeof(*workspace->keys), message, message_capacity) != 0
        || allocate(reinterpret_cast<void**>(&workspace->priorities), required * sizeof(*workspace->priorities), message, message_capacity) != 0
        || allocate(reinterpret_cast<void**>(&workspace->indices), required * sizeof(*workspace->indices), message, message_capacity) != 0
        || allocate(reinterpret_cast<void**>(&workspace->sorted_ranks), required * sizeof(*workspace->sorted_ranks), message, message_capacity) != 0
        || allocate(reinterpret_cast<void**>(&workspace->ranks), required * sizeof(*workspace->ranks), message, message_capacity) != 0
        || allocate(reinterpret_cast<void**>(&workspace->batch_entries), required * sizeof(*workspace->batch_entries), message, message_capacity) != 0) {
        workspace->release();
        return -2;
    }
    workspace->capacity = required;
    return 0;
}

int copy_inputs(Workspace* workspace,
                const std::uint64_t* host_groups,
                const std::uint32_t* host_priorities,
                std::size_t length,
                char* message,
                std::size_t message_capacity) {
    auto error = cudaMemcpy(
        workspace->groups, host_groups, length * sizeof(*workspace->groups), cudaMemcpyHostToDevice);
    if (error == cudaSuccess) {
        error = cudaMemcpy(
            workspace->priorities,
            host_priorities,
            length * sizeof(*workspace->priorities),
            cudaMemcpyHostToDevice);
    }
    return error == cudaSuccess ? 0 : fail(error, message, message_capacity);
}

int finish(Workspace* workspace,
           std::uint32_t* host_ranks,
           std::size_t length,
           cudaError_t error,
           char* message,
           std::size_t message_capacity) {
    if (error == cudaSuccess) {
        error = cudaMemcpy(
            host_ranks, workspace->ranks, length * sizeof(*workspace->ranks), cudaMemcpyDeviceToHost);
    }
    if (error == cudaSuccess) error = cudaDeviceSynchronize();
    return error == cudaSuccess ? 0 : fail(error, message, message_capacity);
}
}

extern "C" int ckt_cuda_device_name(char* output, std::size_t capacity) {
    int device = 0;
    auto error = cudaGetDevice(&device);
    if (error != cudaSuccess) return fail(error, output, capacity);
    cudaDeviceProp properties{};
    error = cudaGetDeviceProperties(&properties, device);
    if (error != cudaSuccess) return fail(error, output, capacity);
    if (output != nullptr && capacity > 0) std::snprintf(output, capacity, "%s", properties.name);
    return 0;
}

extern "C" void* ckt_cuda_workspace_create(char* message, std::size_t message_capacity) {
    auto* workspace = new (std::nothrow) Workspace{};
    if (workspace == nullptr && message != nullptr && message_capacity > 0) {
        std::snprintf(message, message_capacity, "failed to allocate CUDA workspace host state");
    }
    return workspace;
}

extern "C" void ckt_cuda_workspace_destroy(void* opaque_workspace) {
    delete static_cast<Workspace*>(opaque_workspace);
}

extern "C" int ckt_cuda_rank(void* opaque_workspace,
                             const std::uint64_t* host_groups,
                             const std::uint32_t* host_priorities,
                             std::uint32_t* host_ranks,
                             std::size_t length,
                             char* message,
                             std::size_t message_capacity) {
    if (length == 0) return 0;
    if (opaque_workspace == nullptr) {
        if (message != nullptr && message_capacity > 0) {
            std::snprintf(message, message_capacity, "CUDA workspace is null");
        }
        return -1;
    }
    if (length > 0xffffffffULL) {
        if (message != nullptr && message_capacity > 0) {
            std::snprintf(message, message_capacity, "CUDA rank input exceeds u32 indexing");
        }
        return -1;
    }
    auto* workspace = static_cast<Workspace*>(opaque_workspace);
    auto status = ensure_capacity(workspace, length, message, message_capacity);
    if (status != 0) return status;
    status = copy_inputs(
        workspace, host_groups, host_priorities, length, message, message_capacity);
    if (status != 0) return status;

    constexpr unsigned threads = 256;
    const auto blocks = static_cast<unsigned>((length + threads - 1) / threads);
    pack_keys<<<blocks, threads>>>(
        workspace->groups, workspace->priorities, workspace->keys, workspace->indices, length);
    auto error = cudaGetLastError();
    if (error == cudaSuccess) {
        try {
            thrust::device_ptr<std::uint64_t> key_pointer(workspace->keys);
            thrust::device_ptr<std::uint32_t> index_pointer(workspace->indices);
            thrust::sort_by_key(thrust::device, key_pointer, key_pointer + length, index_pointer);
            extract_groups<<<blocks, threads>>>(workspace->keys, workspace->groups, length);
            error = cudaGetLastError();
            if (error == cudaSuccess) {
                thrust::device_ptr<std::uint64_t> group_pointer(workspace->groups);
                thrust::device_ptr<std::uint32_t> rank_pointer(workspace->sorted_ranks);
                thrust::inclusive_scan_by_key(
                    thrust::device,
                    group_pointer,
                    group_pointer + length,
                    thrust::make_constant_iterator<std::uint32_t>(1),
                    rank_pointer,
                    thrust::equal_to<std::uint64_t>(),
                    thrust::plus<std::uint32_t>());
                scatter_ranks<<<blocks, threads>>>(
                    workspace->indices, workspace->sorted_ranks, workspace->ranks, length);
                error = cudaGetLastError();
            }
        } catch (const std::exception& exception) {
            if (message != nullptr && message_capacity > 0) {
                std::snprintf(message, message_capacity, "%s", exception.what());
            }
            return -3;
        } catch (...) {
            if (message != nullptr && message_capacity > 0) {
                std::snprintf(message, message_capacity, "unknown CUDA/Thrust exception");
            }
            return -4;
        }
    }
    return finish(workspace, host_ranks, length, error, message, message_capacity);
}

extern "C" int ckt_cuda_rank_batch(void* opaque_workspace,
                                   const std::uint64_t* host_groups,
                                   const std::uint32_t* host_priorities,
                                   std::uint32_t* host_ranks,
                                   std::size_t length,
                                   char* message,
                                   std::size_t message_capacity) {
    if (length == 0) return 0;
    if (opaque_workspace == nullptr || length > 0xffffffffULL) {
        if (message != nullptr && message_capacity > 0) {
            std::snprintf(message, message_capacity, "invalid CUDA batch workspace or length");
        }
        return -1;
    }
    auto* workspace = static_cast<Workspace*>(opaque_workspace);
    auto status = ensure_capacity(workspace, length, message, message_capacity);
    if (status != 0) return status;
    status = copy_inputs(
        workspace, host_groups, host_priorities, length, message, message_capacity);
    if (status != 0) return status;

    constexpr unsigned threads = 256;
    const auto blocks = static_cast<unsigned>((length + threads - 1) / threads);
    pack_batch_entries<<<blocks, threads>>>(
        workspace->groups, workspace->priorities, workspace->batch_entries, length);
    auto error = cudaGetLastError();
    if (error == cudaSuccess) {
        try {
            thrust::device_ptr<BatchEntry> entries(workspace->batch_entries);
            thrust::sort(thrust::device, entries, entries + length, BatchEntryLess{});
            extract_batch_groups<<<blocks, threads>>>(
                workspace->batch_entries, workspace->groups, length);
            error = cudaGetLastError();
            if (error == cudaSuccess) {
                thrust::device_ptr<std::uint64_t> group_pointer(workspace->groups);
                thrust::device_ptr<std::uint32_t> rank_pointer(workspace->sorted_ranks);
                thrust::inclusive_scan_by_key(
                    thrust::device,
                    group_pointer,
                    group_pointer + length,
                    thrust::make_constant_iterator<std::uint32_t>(1),
                    rank_pointer,
                    thrust::equal_to<std::uint64_t>(),
                    thrust::plus<std::uint32_t>());
                scatter_batch_ranks<<<blocks, threads>>>(
                    workspace->batch_entries,
                    workspace->sorted_ranks,
                    workspace->ranks,
                    length);
                error = cudaGetLastError();
            }
        } catch (const std::exception& exception) {
            if (message != nullptr && message_capacity > 0) {
                std::snprintf(message, message_capacity, "%s", exception.what());
            }
            return -3;
        } catch (...) {
            if (message != nullptr && message_capacity > 0) {
                std::snprintf(message, message_capacity, "unknown CUDA/Thrust exception");
            }
            return -4;
        }
    }
    return finish(workspace, host_ranks, length, error, message, message_capacity);
}
