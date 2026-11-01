fn main() {
    println!("cargo:rerun-if-changed=src/cuda/rank.cu");
    if std::env::var_os("CARGO_FEATURE_CUDA").is_none() {
        return;
    }
    cc::Build::new()
        .cuda(true)
        .cudart("shared")
        .static_crt(false)
        .cpp(true)
        .file("src/cuda/rank.cu")
        .flag("-std=c++17")
        .compile("ckt_v4_cuda");
}
