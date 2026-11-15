fn main() {
    println!("cargo:rerun-if-changed=native/system_audio.m");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let out = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap());
        let arch = match std::env::var("CARGO_CFG_TARGET_ARCH").unwrap().as_str() {
            "aarch64" => "arm64",
            "x86_64" => "x86_64",
            other => panic!("unsupported macOS architecture: {other}"),
        };
        let object = out.join("system_audio.o");
        assert!(
            std::process::Command::new("xcrun")
                .args([
                    "clang",
                    "-arch",
                    arch,
                    "-mmacosx-version-min=14.4",
                    "-fobjc-arc",
                    "-Wall",
                    "-Wextra",
                    "-Werror",
                    "-c",
                    "native/system_audio.m",
                    "-o"
                ])
                .arg(&object)
                .status()
                .expect("Xcode command line tools required")
                .success(),
            "system audio bridge compilation failed"
        );
        assert!(std::process::Command::new("xcrun")
            .args(["ar", "rcs"])
            .arg(out.join("libog_system_audio.a"))
            .arg(object)
            .status()
            .unwrap()
            .success());
        println!("cargo:rustc-link-search=native={}", out.display());
        println!("cargo:rustc-link-lib=static=og_system_audio");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=CoreAudio");
    }
    tauri_build::build()
}
