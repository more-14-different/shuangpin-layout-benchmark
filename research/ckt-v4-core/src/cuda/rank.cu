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

namespace {
constexpr unsigned PRIORITY_BITS = 23;

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

__global__ void extract_groups(const std::uint64_t* keys,
                               std::uint64_t* groups,
                               std::size_t length) {
    const auto index = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (index < length) groups[index] = keys[index] >> PRIORITY_BITS;
}

__global__ void scatter_ranks(const std::uint32_t* indices,
                              const std::uint32_t* sorted_ranks,
                              std::uint32_t* ranks,
                              std::size_t length) {
    const auto index = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (index < length) ranks[indices[index]] = sorted_ranks[index];
}

int fail(cudaError_t error, char* message, std::size_t capacity) {
    if (message != nullptr && capacity > 0) {
        std::snprintf(message, capacity, "%s", cudaGetErrorString(error));
    }
    return static_cast<int>(error);
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

extern "C" int ckt_cuda_rank(const std::uint64_t* host_groups,
                             const std::uint32_t* host_priorities,
                             std::uint32_t* host_ranks,
                             std::size_t length,
                             char* message,
                             std::size_t message_capacity) {
    if (length == 0) return 0;
    if (length > 0xffffffffULL) {
        if (message != nullptr && message_capacity > 0) {
            std::snprintf(message, message_capacity, "CUDA rank input exceeds u32 indexing");
        }
        return -1;
    }

    std::uint64_t *groups = nullptr, *keys = nullptr;
    std::uint32_t *priorities = nullptr, *indices = nullptr, *sorted_ranks = nullptr, *ranks = nullptr;
    auto cleanup = [&]() {
        cudaFree(groups);
        cudaFree(keys);
        cudaFree(priorities);
        cudaFree(indices);
        cudaFree(sorted_ranks);
        cudaFree(ranks);
    };
    auto allocate = [&](void** pointer, std::size_t bytes) {
        const auto error = cudaMalloc(pointer, bytes);
        if (error != cudaSuccess) return fail(error, message, message_capacity);
        return 0;
    };
    if (allocate(reinterpret_cast<void**>(&groups), length * sizeof(*groups)) != 0
        || allocate(reinterpret_cast<void**>(&keys), length * sizeof(*keys)) != 0
        || allocate(reinterpret_cast<void**>(&priorities), length * sizeof(*priorities)) != 0
        || allocate(reinterpret_cast<void**>(&indices), length * sizeof(*indices)) != 0
        || allocate(reinterpret_cast<void**>(&sorted_ranks), length * sizeof(*sorted_ranks)) != 0
        || allocate(reinterpret_cast<void**>(&ranks), length * sizeof(*ranks)) != 0) {
        cleanup();
        return -2;
    }

    auto error = cudaMemcpy(groups, host_groups, length * sizeof(*groups), cudaMemcpyHostToDevice);
    if (error == cudaSuccess) {
        error = cudaMemcpy(priorities, host_priorities, length * sizeof(*priorities), cudaMemcpyHostToDevice);
    }
    if (error != cudaSuccess) {
        cleanup();
        return fail(error, message, message_capacity);
    }

    constexpr unsigned threads = 256;
    const auto blocks = static_cast<unsigned>((length + threads - 1) / threads);
    pack_keys<<<blocks, threads>>>(groups, priorities, keys, indices, length);
    error = cudaGetLastError();
    if (error == cudaSuccess) {
        try {
            thrust::device_ptr<std::uint64_t> key_pointer(keys);
            thrust::device_ptr<std::uint32_t> index_pointer(indices);
            thrust::sort_by_key(thrust::device, key_pointer, key_pointer + length, index_pointer);
            extract_groups<<<blocks, threads>>>(keys, groups, length);
            error = cudaGetLastError();
            if (error == cudaSuccess) {
                thrust::device_ptr<std::uint64_t> group_pointer(groups);
                thrust::device_ptr<std::uint32_t> rank_pointer(sorted_ranks);
                thrust::inclusive_scan_by_key(
                    thrust::device,
                    group_pointer,
                    group_pointer + length,
                    thrust::make_constant_iterator<std::uint32_t>(1),
                    rank_pointer,
                    thrust::equal_to<std::uint64_t>(),
                    thrust::plus<std::uint32_t>());
                scatter_ranks<<<blocks, threads>>>(indices, sorted_ranks, ranks, length);
                error = cudaGetLastError();
            }
        } catch (const std::exception& exception) {
            if (message != nullptr && message_capacity > 0) {
                std::snprintf(message, message_capacity, "%s", exception.what());
            }
            cleanup();
            return -3;
        } catch (...) {
            if (message != nullptr && message_capacity > 0) {
                std::snprintf(message, message_capacity, "unknown CUDA/Thrust exception");
            }
            cleanup();
            return -4;
        }
    }
    if (error == cudaSuccess) {
        error = cudaMemcpy(host_ranks, ranks, length * sizeof(*ranks), cudaMemcpyDeviceToHost);
    }
    if (error == cudaSuccess) error = cudaDeviceSynchronize();
    cleanup();
    return error == cudaSuccess ? 0 : fail(error, message, message_capacity);
}
