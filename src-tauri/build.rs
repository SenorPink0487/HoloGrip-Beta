fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .plugin("apple-vision", tauri_build::InlinedPlugin::new()),
    )
    .expect("failed to build Tauri application permissions");

    #[cfg(target_os = "macos")]
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        // Guard against duplicate Swift compilation in gen/apple/Sources/virtuallab,
        // which would shadow HoloGripAppleVision's C FFI symbols with a second
        // unattached AppleVisionHandManager.shared singleton.
        let duplicate_swift = std::path::Path::new("gen/apple/Sources/virtuallab/AppleVisionHandManager.swift");
        if duplicate_swift.exists() {
            let _ = std::fs::remove_file(duplicate_swift);
            println!(
                "cargo:warning=Removed duplicate gen/apple/Sources/virtuallab/AppleVisionHandManager.swift to prevent split-singleton linker shadowing."
            );
        }

        // Rust also links a cdylib, before Xcode links the application. Compile
        // the Swift bridge here so its C exports are available to both links.
        println!("cargo:rerun-if-env-changed=DEP_TAURI_IOS_LIBRARY_PATH");
        println!("cargo:rerun-if-env-changed=IPHONEOS_DEPLOYMENT_TARGET");
        println!("cargo:rerun-if-changed=native_ios/Package.swift");
        println!("cargo:rerun-if-changed=native_ios/AppleVisionPlugin.swift");
        println!("cargo:rerun-if-changed=native_ios/AppleVisionHandManager.swift");
        println!("cargo:rerun-if-changed=native_ios/AppleSpeechRecognitionManager.swift");
        if std::env::var_os("IPHONEOS_DEPLOYMENT_TARGET").is_none() {
            std::env::set_var("IPHONEOS_DEPLOYMENT_TARGET", "15.0");
        }
        tauri_utils::build::link_apple_library("HoloGripAppleVision", "native_ios");
    }
}
