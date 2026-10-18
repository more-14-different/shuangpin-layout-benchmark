#include <cuda_runtime.h>
#include <thrust/device_ptr.h>
#include <thrust/execution_policy.h>
#include <thrust/functional.h>
#include <thrust/iterator/constant_iterator.h>
#include <thrust/scan.h>
#include <thrust/sort.h>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <exception>
#include <new>
#include <vector>

namespace {
constexpr unsigned PRIORITY_BITS = 23;
constexpr std::uint32_t NO_STAGE = 0xffffffffU;
constexpr std::uint64_t INACTIVE_GROUP = 0x8000000000000000ULL;

struct Entry { std::uint64_t group; std::uint32_t priority; std::uint32_t index; };
struct EntryLess {
    __host__ __device__ bool operator()(const Entry& a, const Entry& b) const {
        return a.group < b.group || (a.group == b.group && a.priority < b.priority);
    }
};

struct Workspace {
    std::size_t rank_capacity = 0;
    std::uint64_t *groups = nullptr, *keys = nullptr;
    std::uint32_t *priorities = nullptr, *indices = nullptr, *sorted_ranks = nullptr, *ranks = nullptr;
    Entry* entries = nullptr;

    std::size_t row_count = 0, stage_count = 0, slot_count = 0, order_count = 0, max_order_slots = 0;
    std::uint32_t *topology_priorities = nullptr, *row_first_stage = nullptr;
    std::uint32_t *stage_order = nullptr, *stage_pool = nullptr, *stage_slot_offset = nullptr;
    std::uint32_t *stage_slot_count = nullptr, *stage_next = nullptr;
    std::uint32_t *slot_row = nullptr, *slot_stage = nullptr, *order_slots = nullptr;
    std::vector<std::uint32_t> host_order_offsets;

    std::size_t lane_capacity = 0;
    std::uint64_t *codes = nullptr, *out_codes = nullptr, *resolve_groups = nullptr;
    double *costs = nullptr, *out_costs = nullptr;
    std::uint32_t *active = nullptr, *slot_ranks = nullptr, *resolve_sorted_ranks = nullptr;
    std::uint32_t *out_ranks = nullptr, *out_stages = nullptr, *resolver_error = nullptr;
    Entry* resolve_entries = nullptr;

    void release_rank() {
        cudaFree(groups); cudaFree(keys); cudaFree(priorities); cudaFree(indices);
        cudaFree(sorted_ranks); cudaFree(ranks); cudaFree(entries);
        groups = keys = nullptr; priorities = indices = sorted_ranks = ranks = nullptr; entries = nullptr;
        rank_capacity = 0;
    }
    void release_resolver() {
        cudaFree(codes); cudaFree(costs); cudaFree(active); cudaFree(slot_ranks);
        cudaFree(resolve_entries); cudaFree(resolve_groups); cudaFree(resolve_sorted_ranks);
        cudaFree(out_codes); cudaFree(out_costs); cudaFree(out_ranks); cudaFree(out_stages);
        cudaFree(resolver_error);
        codes = out_codes = resolve_groups = nullptr; costs = out_costs = nullptr;
        active = slot_ranks = resolve_sorted_ranks = out_ranks = out_stages = resolver_error = nullptr;
        resolve_entries = nullptr; lane_capacity = 0;
    }
    void release_topology() {
        release_resolver();
        cudaFree(topology_priorities); cudaFree(row_first_stage); cudaFree(stage_order);
        cudaFree(stage_pool); cudaFree(stage_slot_offset); cudaFree(stage_slot_count);
        cudaFree(stage_next); cudaFree(slot_row); cudaFree(slot_stage); cudaFree(order_slots);
        topology_priorities = row_first_stage = stage_order = stage_pool = nullptr;
        stage_slot_offset = stage_slot_count = stage_next = slot_row = slot_stage = order_slots = nullptr;
        host_order_offsets.clear(); row_count = stage_count = slot_count = order_count = max_order_slots = 0;
    }
    ~Workspace() { release_rank(); release_topology(); }
};

__global__ void pack_keys(const std::uint64_t* groups, const std::uint32_t* priorities,
                          std::uint64_t* keys, std::uint32_t* indices, std::size_t n) {
    const auto i = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (i < n) { keys[i] = (groups[i] << PRIORITY_BITS) | priorities[i]; indices[i] = i; }
}
__global__ void pack_entries(const std::uint64_t* groups, const std::uint32_t* priorities,
                             Entry* entries, std::size_t n) {
    const auto i = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (i < n) entries[i] = Entry{groups[i], priorities[i], static_cast<std::uint32_t>(i)};
}
__global__ void extract_key_groups(const std::uint64_t* keys, std::uint64_t* groups, std::size_t n) {
    const auto i = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (i < n) groups[i] = keys[i] >> PRIORITY_BITS;
}
__global__ void extract_entry_groups(const Entry* entries, std::uint64_t* groups, std::size_t n) {
    const auto i = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (i < n) groups[i] = entries[i].group;
}
__global__ void scatter_key_ranks(const std::uint32_t* indices, const std::uint32_t* sorted,
                                  std::uint32_t* ranks, std::size_t n) {
    const auto i = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (i < n) ranks[indices[i]] = sorted[i];
}
__global__ void scatter_entry_ranks(const Entry* entries, const std::uint32_t* sorted,
                                    std::uint32_t* ranks, std::size_t n) {
    const auto i = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (i < n) ranks[entries[i].index] = sorted[i];
}
__global__ void initialize_active(const std::uint32_t* first, std::uint32_t* active,
                                  std::size_t rows, std::size_t n) {
    const auto i = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (i < n) active[i] = first[i % rows];
}
__global__ void construct_active_entries(
    const std::uint64_t* codes, const std::uint32_t* active, const std::uint32_t* priorities,
    const std::uint32_t* stage_pool, const std::uint32_t* slot_row,
    const std::uint32_t* slot_stage, const std::uint32_t* order_slots,
    std::size_t order_offset, std::size_t order_slot_count, std::size_t row_count,
    std::size_t slot_count, Entry* entries, std::size_t n) {
    const auto i = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (i >= n) return;
    const auto lane = i / order_slot_count;
    const auto slot = order_slots[order_offset + i % order_slot_count];
    const auto row = slot_row[slot]; const auto stage = slot_stage[slot];
    const auto source = lane * slot_count + slot;
    const bool is_active = active[lane * row_count + row] == stage;
    const auto group = is_active
        ? (static_cast<std::uint64_t>(lane) << 40)
            | (static_cast<std::uint64_t>(stage_pool[stage]) << 36) | codes[source]
        : INACTIVE_GROUP | source;
    entries[i] = Entry{group, priorities[row], static_cast<std::uint32_t>(source)};
}
__global__ void select_row_best(
    const std::uint64_t* codes, const double* costs, const std::uint32_t* stage_order,
    const std::uint32_t* stage_slot_offset, const std::uint32_t* stage_slot_count,
    const std::uint32_t* stage_next, const std::uint32_t* slot_ranks, std::uint32_t* active,
    std::uint64_t* out_codes, double* out_costs, std::uint32_t* out_ranks,
    std::uint32_t* out_stages, std::uint32_t* resolver_error, std::uint32_t order,
    std::size_t row_count, std::size_t slot_count, std::size_t n) {
    const auto flat = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (flat >= n) return;
    const auto stage = active[flat];
    if (stage == NO_STAGE || stage_order[stage] != order) return;
    const auto lane = flat / row_count;
    const auto first = stage_slot_offset[stage]; const auto end = first + stage_slot_count[stage];
    std::uint32_t best_rank = NO_STAGE; std::uint64_t best_code = 0;
    double best_cost = 0.0; bool has_cost = false;
    for (auto slot = first; slot < end; ++slot) {
        const auto source = lane * slot_count + slot; const auto rank = slot_ranks[source];
        if (rank < best_rank) { best_rank = rank; has_cost = false; }
        if (rank != best_rank) continue;
        const auto cost = costs[source];
        if (isfinite(cost) && (!has_cost || cost < best_cost)) {
            best_code = codes[source]; best_cost = cost; has_cost = true;
        }
    }
    const auto next = stage_next[stage];
    if (best_rank == 1 || next == NO_STAGE) {
        if (!has_cost) { atomicCAS(resolver_error, 0U, static_cast<std::uint32_t>(flat + 1)); return; }
        out_codes[flat] = best_code; out_costs[flat] = best_cost;
        out_ranks[flat] = best_rank; out_stages[flat] = stage; active[flat] = NO_STAGE;
    } else active[flat] = next;
}
__global__ void check_unresolved(const std::uint32_t* active, std::uint32_t* error, std::size_t n) {
    const auto i = static_cast<std::size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (i < n && active[i] != NO_STAGE)
        atomicCAS(error, 0U, 0x80000000U | static_cast<std::uint32_t>(i + 1));
}

int fail(cudaError_t e, char* message, std::size_t cap) {
    if (message && cap) std::snprintf(message, cap, "%s", cudaGetErrorString(e)); return static_cast<int>(e);
}
int fail_text(const char* text, char* message, std::size_t cap, int status = -1) {
    if (message && cap) std::snprintf(message, cap, "%s", text); return status;
}
template<class T> int alloc(T** p, std::size_t n, char* message, std::size_t cap) {
    const auto e = cudaMalloc(reinterpret_cast<void**>(p), n * sizeof(T));
    return e == cudaSuccess ? 0 : fail(e, message, cap);
}
template<class T> int upload(T* dst, const T* src, std::size_t n, char* message, std::size_t cap) {
    const auto e = cudaMemcpy(dst, src, n * sizeof(T), cudaMemcpyHostToDevice);
    return e == cudaSuccess ? 0 : fail(e, message, cap);
}
int ensure_rank(Workspace* w, std::size_t n, char* message, std::size_t cap) {
    if (n <= w->rank_capacity) return 0; w->release_rank();
    if (alloc(&w->groups,n,message,cap)||alloc(&w->keys,n,message,cap)||alloc(&w->priorities,n,message,cap)
        ||alloc(&w->indices,n,message,cap)||alloc(&w->sorted_ranks,n,message,cap)
        ||alloc(&w->ranks,n,message,cap)||alloc(&w->entries,n,message,cap)) {
        w->release_rank(); return -2;
    }
    w->rank_capacity = n; return 0;
}
int ensure_resolver(Workspace* w, std::size_t lanes, char* message, std::size_t cap) {
    if (lanes <= w->lane_capacity) return 0; w->release_resolver();
    const auto sn = lanes*w->slot_count, rn = lanes*w->row_count, en = lanes*w->max_order_slots;
    if (alloc(&w->codes,sn,message,cap)||alloc(&w->costs,sn,message,cap)
        ||alloc(&w->active,rn,message,cap)||alloc(&w->slot_ranks,sn,message,cap)
        ||alloc(&w->resolve_entries,en,message,cap)||alloc(&w->resolve_groups,en,message,cap)
        ||alloc(&w->resolve_sorted_ranks,en,message,cap)||alloc(&w->out_codes,rn,message,cap)
        ||alloc(&w->out_costs,rn,message,cap)||alloc(&w->out_ranks,rn,message,cap)
        ||alloc(&w->out_stages,rn,message,cap)||alloc(&w->resolver_error,1,message,cap)) {
        w->release_resolver(); return -2;
    }
    w->lane_capacity = lanes; return 0;
}
int rank_scan(Entry* entries, std::uint64_t* groups, std::uint32_t* sorted,
              std::uint32_t* ranks, std::size_t n, char* message, std::size_t cap) {
    constexpr unsigned threads=256; const auto blocks=static_cast<unsigned>((n+threads-1)/threads);
    try {
        thrust::device_ptr<Entry> ep(entries); thrust::sort(thrust::device,ep,ep+n,EntryLess{});
        extract_entry_groups<<<blocks,threads>>>(entries,groups,n);
        auto e=cudaGetLastError(); if(e!=cudaSuccess)return fail(e,message,cap);
        thrust::device_ptr<std::uint64_t> gp(groups); thrust::device_ptr<std::uint32_t> rp(sorted);
        thrust::inclusive_scan_by_key(thrust::device,gp,gp+n,
            thrust::make_constant_iterator<std::uint32_t>(1),rp,
            thrust::equal_to<std::uint64_t>(),thrust::plus<std::uint32_t>());
        scatter_entry_ranks<<<blocks,threads>>>(entries,sorted,ranks,n);
        e=cudaGetLastError(); return e==cudaSuccess?0:fail(e,message,cap);
    } catch(const std::exception& e) { return fail_text(e.what(),message,cap,-3); }
      catch(...) { return fail_text("unknown CUDA/Thrust exception",message,cap,-4); }
}
}

extern "C" int ckt_cuda_device_name(char* output, std::size_t cap) {
    int device=0; auto e=cudaGetDevice(&device); if(e!=cudaSuccess)return fail(e,output,cap);
    cudaDeviceProp p{}; e=cudaGetDeviceProperties(&p,device); if(e!=cudaSuccess)return fail(e,output,cap);
    if(output&&cap)std::snprintf(output,cap,"%s",p.name); return 0;
}
extern "C" void* ckt_cuda_workspace_create(char* message, std::size_t cap) {
    auto* w=new(std::nothrow) Workspace{}; if(!w&&message&&cap)std::snprintf(message,cap,"CUDA host allocation failed"); return w;
}
extern "C" void ckt_cuda_workspace_destroy(void* opaque) { delete static_cast<Workspace*>(opaque); }

extern "C" int ckt_cuda_workspace_set_topology(
    void* opaque, const std::uint32_t* priorities, const std::uint32_t* row_first_stage,
    const std::uint32_t* stage_order, const std::uint32_t* stage_pool,
    const std::uint32_t* stage_slot_offset, const std::uint32_t* stage_slot_count,
    const std::uint32_t* stage_next, const std::uint32_t* slot_row,
    const std::uint32_t* slot_stage, const std::uint32_t* order_offsets,
    const std::uint32_t* order_slots, std::size_t rows, std::size_t stages,
    std::size_t slots, std::size_t orders, char* message, std::size_t cap) {
    if(!opaque||!rows||!stages||!slots||!orders)return fail_text("invalid CUDA resolver topology",message,cap);
    if(slots>0xffffffffULL||rows>0x7ffffffeULL)return fail_text("CUDA topology exceeds u32 indexing",message,cap);
    auto* w=static_cast<Workspace*>(opaque); w->release_topology();
    if(alloc(&w->topology_priorities,rows,message,cap)||alloc(&w->row_first_stage,rows,message,cap)
       ||alloc(&w->stage_order,stages,message,cap)||alloc(&w->stage_pool,stages,message,cap)
       ||alloc(&w->stage_slot_offset,stages,message,cap)||alloc(&w->stage_slot_count,stages,message,cap)
       ||alloc(&w->stage_next,stages,message,cap)||alloc(&w->slot_row,slots,message,cap)
       ||alloc(&w->slot_stage,slots,message,cap)||alloc(&w->order_slots,slots,message,cap)
       ||upload(w->topology_priorities,priorities,rows,message,cap)
       ||upload(w->row_first_stage,row_first_stage,rows,message,cap)
       ||upload(w->stage_order,stage_order,stages,message,cap)||upload(w->stage_pool,stage_pool,stages,message,cap)
       ||upload(w->stage_slot_offset,stage_slot_offset,stages,message,cap)
       ||upload(w->stage_slot_count,stage_slot_count,stages,message,cap)
       ||upload(w->stage_next,stage_next,stages,message,cap)||upload(w->slot_row,slot_row,slots,message,cap)
       ||upload(w->slot_stage,slot_stage,slots,message,cap)||upload(w->order_slots,order_slots,slots,message,cap)) {
        w->release_topology(); return -2;
    }
    w->row_count=rows; w->stage_count=stages; w->slot_count=slots; w->order_count=orders;
    w->host_order_offsets.assign(order_offsets,order_offsets+orders+1);
    for(std::size_t i=0;i<orders;++i) {
        const auto n=order_offsets[i+1]-order_offsets[i]; if(n>w->max_order_slots)w->max_order_slots=n;
    }
    return 0;
}

extern "C" int ckt_cuda_resolve_batch(
    void* opaque, const std::uint64_t* host_codes, const double* host_costs,
    std::uint64_t* host_out_codes, double* host_out_costs,
    std::uint32_t* host_out_ranks, std::uint32_t* host_out_stages,
    std::size_t lanes, char* message, std::size_t cap) {
    if(!opaque||!lanes||lanes>=(1ULL<<23))return fail_text("invalid CUDA resolver lane count",message,cap);
    auto* w=static_cast<Workspace*>(opaque); if(!w->slot_count)return fail_text("CUDA topology not initialized",message,cap);
    const auto sn=lanes*w->slot_count, rn=lanes*w->row_count;
    if(sn>0xffffffffULL||rn>0x7ffffffeULL)return fail_text("CUDA resolver batch exceeds u32 indexing",message,cap);
    auto status=ensure_resolver(w,lanes,message,cap); if(status)return status;
    if((status=upload(w->codes,host_codes,sn,message,cap))||(status=upload(w->costs,host_costs,sn,message,cap)))return status;
    auto e=cudaMemset(w->resolver_error,0,sizeof(std::uint32_t));
    constexpr unsigned threads=256; const auto row_blocks=static_cast<unsigned>((rn+threads-1)/threads);
    if(e==cudaSuccess){initialize_active<<<row_blocks,threads>>>(w->row_first_stage,w->active,w->row_count,rn);e=cudaGetLastError();}
    for(std::uint32_t order=0;e==cudaSuccess&&order<w->order_count;++order){
        const auto offset=w->host_order_offsets[order];
        const auto count=w->host_order_offsets[order+1]-offset;
        const auto en=lanes*count; const auto blocks=static_cast<unsigned>((en+threads-1)/threads);
        construct_active_entries<<<blocks,threads>>>(w->codes,w->active,w->topology_priorities,
            w->stage_pool,w->slot_row,w->slot_stage,w->order_slots,offset,count,
            w->row_count,w->slot_count,w->resolve_entries,en);
        e=cudaGetLastError(); if(e!=cudaSuccess)break;
        status=rank_scan(w->resolve_entries,w->resolve_groups,w->resolve_sorted_ranks,
                         w->slot_ranks,en,message,cap); if(status)return status;
        select_row_best<<<row_blocks,threads>>>(w->codes,w->costs,w->stage_order,
            w->stage_slot_offset,w->stage_slot_count,w->stage_next,w->slot_ranks,w->active,
            w->out_codes,w->out_costs,w->out_ranks,w->out_stages,w->resolver_error,order,
            w->row_count,w->slot_count,rn);
        e=cudaGetLastError();
    }
    if(e==cudaSuccess){check_unresolved<<<row_blocks,threads>>>(w->active,w->resolver_error,rn);e=cudaGetLastError();}
    std::uint32_t host_error=0;
    if(e==cudaSuccess)e=cudaMemcpy(&host_error,w->resolver_error,sizeof(host_error),cudaMemcpyDeviceToHost);
    if(e!=cudaSuccess)return fail(e,message,cap);
    if(host_error){
        const bool unresolved=host_error&0x80000000U; const auto flat=(host_error&0x7fffffffU)-1;
        if(message&&cap)std::snprintf(message,cap,unresolved?"CUDA row %u unresolved":"no finite motor cost for CUDA row %u",flat);
        return -5;
    }
    e=cudaMemcpy(host_out_codes,w->out_codes,rn*sizeof(std::uint64_t),cudaMemcpyDeviceToHost);
    if(e==cudaSuccess)e=cudaMemcpy(host_out_costs,w->out_costs,rn*sizeof(double),cudaMemcpyDeviceToHost);
    if(e==cudaSuccess)e=cudaMemcpy(host_out_ranks,w->out_ranks,rn*sizeof(std::uint32_t),cudaMemcpyDeviceToHost);
    if(e==cudaSuccess)e=cudaMemcpy(host_out_stages,w->out_stages,rn*sizeof(std::uint32_t),cudaMemcpyDeviceToHost);
    if(e==cudaSuccess)e=cudaDeviceSynchronize(); return e==cudaSuccess?0:fail(e,message,cap);
}

extern "C" int ckt_cuda_rank(void* opaque,const std::uint64_t* host_groups,
    const std::uint32_t* host_priorities,std::uint32_t* host_ranks,std::size_t n,
    char* message,std::size_t cap){
    if(!n)return 0;if(!opaque||n>0xffffffffULL)return fail_text("invalid CUDA rank input",message,cap);
    auto*w=static_cast<Workspace*>(opaque);auto status=ensure_rank(w,n,message,cap);if(status)return status;
    if((status=upload(w->groups,host_groups,n,message,cap))||(status=upload(w->priorities,host_priorities,n,message,cap)))return status;
    constexpr unsigned threads=256;const auto blocks=static_cast<unsigned>((n+threads-1)/threads);
    pack_keys<<<blocks,threads>>>(w->groups,w->priorities,w->keys,w->indices,n);auto e=cudaGetLastError();
    if(e==cudaSuccess)try{
        thrust::device_ptr<std::uint64_t> kp(w->keys);thrust::device_ptr<std::uint32_t> ip(w->indices);
        thrust::sort_by_key(thrust::device,kp,kp+n,ip);extract_key_groups<<<blocks,threads>>>(w->keys,w->groups,n);
        e=cudaGetLastError();if(e==cudaSuccess){thrust::device_ptr<std::uint64_t> gp(w->groups);
        thrust::device_ptr<std::uint32_t> rp(w->sorted_ranks);thrust::inclusive_scan_by_key(thrust::device,gp,gp+n,
        thrust::make_constant_iterator<std::uint32_t>(1),rp,thrust::equal_to<std::uint64_t>(),thrust::plus<std::uint32_t>());
        scatter_key_ranks<<<blocks,threads>>>(w->indices,w->sorted_ranks,w->ranks,n);e=cudaGetLastError();}}
        catch(const std::exception&x){return fail_text(x.what(),message,cap,-3);}catch(...){return fail_text("CUDA/Thrust exception",message,cap,-4);}
    if(e==cudaSuccess)e=cudaMemcpy(host_ranks,w->ranks,n*sizeof(std::uint32_t),cudaMemcpyDeviceToHost);
    if(e==cudaSuccess)e=cudaDeviceSynchronize();return e==cudaSuccess?0:fail(e,message,cap);
}
extern "C" int ckt_cuda_rank_batch(void* opaque,const std::uint64_t* host_groups,
    const std::uint32_t* host_priorities,std::uint32_t* host_ranks,std::size_t n,
    char* message,std::size_t cap){
    if(!n)return 0;if(!opaque||n>0xffffffffULL)return fail_text("invalid CUDA batch input",message,cap);
    auto*w=static_cast<Workspace*>(opaque);auto status=ensure_rank(w,n,message,cap);if(status)return status;
    if((status=upload(w->groups,host_groups,n,message,cap))||(status=upload(w->priorities,host_priorities,n,message,cap)))return status;
    constexpr unsigned threads=256;const auto blocks=static_cast<unsigned>((n+threads-1)/threads);
    pack_entries<<<blocks,threads>>>(w->groups,w->priorities,w->entries,n);auto e=cudaGetLastError();if(e!=cudaSuccess)return fail(e,message,cap);
    status=rank_scan(w->entries,w->groups,w->sorted_ranks,w->ranks,n,message,cap);if(status)return status;
    e=cudaMemcpy(host_ranks,w->ranks,n*sizeof(std::uint32_t),cudaMemcpyDeviceToHost);
    if(e==cudaSuccess)e=cudaDeviceSynchronize();return e==cudaSuccess?0:fail(e,message,cap);
}
