// 在 release 模式下防止在 Windows 上弹出额外的控制台窗口，请勿移除！
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  virtuallab_lib::run();
}
