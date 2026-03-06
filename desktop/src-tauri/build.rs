use std::process::Command;
use std::path::PathBuf;
use std::env;

fn main() {
    // macOS-specific build steps
    #[cfg(target_os = "macos")]
    {
        compile_swift_bridge();

        // Add rpath for Swift runtime libraries
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
        println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Frameworks");

        // Also try the Xcode toolchain path
        if let Ok(developer_dir) = env::var("DEVELOPER_DIR") {
            println!(
                "cargo:rustc-link-arg=-Wl,-rpath,{}/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/macosx",
                developer_dir
            );
        } else {
            println!("cargo:rustc-link-arg=-Wl,-rpath,/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/macosx");
        }
    }

    tauri_build::build();
}

#[cfg(target_os = "macos")]
fn compile_swift_bridge() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let swift_src = PathBuf::from(&manifest_dir).join("src/swift/ScreenCaptureAudio.swift");
    let out_dir = env::var("OUT_DIR").unwrap();
    let lib_output = PathBuf::from(&out_dir).join("libsck_bridge.a");

    // Only rebuild if Swift source changed
    println!("cargo:rerun-if-changed=src/swift/ScreenCaptureAudio.swift");
    println!("cargo:rerun-if-changed=src/swift/sck_bridge.h");

    // Determine target architecture
    let target = env::var("TARGET").unwrap_or_else(|_| "aarch64-apple-darwin".to_string());
    let arch = if target.contains("x86_64") {
        "x86_64"
    } else {
        "arm64"
    };

    // Compile Swift to object file
    let obj_output = PathBuf::from(&out_dir).join("sck_bridge.o");

    let swift_status = Command::new("swiftc")
        .args([
            "-c",
            swift_src.to_str().unwrap(),
            "-o",
            obj_output.to_str().unwrap(),
            "-target",
            &format!("{}-apple-macosx13.0", arch),
            "-O",
            "-whole-module-optimization",
            "-parse-as-library",
            "-emit-object",
        ])
        .status()
        .expect("Failed to execute swiftc");

    if !swift_status.success() {
        panic!("Failed to compile Swift code");
    }

    // Create static library from object file
    let ar_status = Command::new("ar")
        .args([
            "rcs",
            lib_output.to_str().unwrap(),
            obj_output.to_str().unwrap(),
        ])
        .status()
        .expect("Failed to execute ar");

    if !ar_status.success() {
        panic!("Failed to create static library");
    }

    // Tell cargo to link our library
    println!("cargo:rustc-link-search=native={}", out_dir);
    println!("cargo:rustc-link-lib=static=sck_bridge");

    // Link required frameworks
    println!("cargo:rustc-link-lib=framework=ScreenCaptureKit");
    println!("cargo:rustc-link-lib=framework=AVFoundation");
    println!("cargo:rustc-link-lib=framework=CoreMedia");
    println!("cargo:rustc-link-lib=framework=CoreAudio");
    println!("cargo:rustc-link-lib=framework=CoreGraphics");
}
