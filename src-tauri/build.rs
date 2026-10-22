fn main() {
    tauri_build::build();

    #[cfg(target_os = "macos")]
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        // Rust also links a cdylib, before Xcode links the application. Compile
        // the Swift bridge here so its C exports are available to both links.
        println!("cargo:rerun-if-env-changed=DEP_TAURI_IOS_LIBRARY_PATH");
        println!("cargo:rerun-if-env-changed=IPHONEOS_DEPLOYMENT_TARGET");
        println!("cargo:rerun-if-changed=native_ios/Package.swift");
        println!("cargo:rerun-if-changed=native_ios/AppleVisionPlugin.swift");
        println!("cargo:rerun-if-changed=native_ios/AppleVisionHandManager.swift");
        if std::env::var_os("IPHONEOS_DEPLOYMENT_TARGET").is_none() {
            std::env::set_var("IPHONEOS_DEPLOYMENT_TARGET", "15.0");
        }
        tauri_utils::build::link_apple_library("HoloGripAppleVision", "native_ios");
    }
}
