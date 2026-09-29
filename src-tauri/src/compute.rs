use rayon::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct SystemHardwareInfo {
    pub os: String,
    pub arch: String,
    pub logical_cores: usize,
    pub backend: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct NBodyResult {
    pub positions: Vec<f32>,
    pub velocities: Vec<f32>,
}

#[tauri::command]
pub fn get_system_info() -> SystemHardwareInfo {
    let cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);

    SystemHardwareInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        logical_cores: cores,
        backend: "Rust Rayon Multi-Core Parallel Engine".to_string(),
    }
}

/// 使用 Rayon 跨所有 CPU 核心并行计算 N 体引力模拟步。
#[tauri::command]
pub fn simulate_nbody_step(
    mut positions: Vec<f32>,
    mut velocities: Vec<f32>,
    masses: Vec<f32>,
    dt: f32,
    g: f32,
    softening: f32,
) -> NBodyResult {
    let n = masses.len();
    if positions.len() < n * 3 || velocities.len() < n * 3 {
        return NBodyResult { positions, velocities };
    }

    let eps_sq = softening * softening;

    // 使用 Rayon 并行计算加速度
    let accelerations: Vec<[f32; 3]> = (0..n)
        .into_par_iter()
        .map(|i| {
            let px = positions[i * 3];
            let py = positions[i * 3 + 1];
            let pz = positions[i * 3 + 2];

            let mut ax = 0.0f32;
            let mut ay = 0.0f32;
            let mut az = 0.0f32;

            for j in 0..n {
                if i == j {
                    continue;
                }
                let dx = positions[j * 3] - px;
                let dy = positions[j * 3 + 1] - py;
                let dz = positions[j * 3 + 2] - pz;

                let dist_sq = dx * dx + dy * dy + dz * dz + eps_sq;
                let inv_dist = 1.0 / dist_sq.sqrt();
                let inv_dist3 = inv_dist * inv_dist * inv_dist;

                let f = g * masses[j] * inv_dist3;
                ax += dx * f;
                ay += dy * f;
                az += dz * f;
            }

            [ax, ay, az]
        })
        .collect();

    for i in 0..n {
        let idx = i * 3;
        velocities[idx] += accelerations[i][0] * dt;
        velocities[idx + 1] += accelerations[i][1] * dt;
        velocities[idx + 2] += accelerations[i][2] * dt;

        positions[idx] += velocities[idx] * dt;
        positions[idx + 1] += velocities[idx + 1] * dt;
        positions[idx + 2] += velocities[idx + 2] * dt;
    }

    NBodyResult {
        positions,
        velocities,
    }
}

/// 二维量子波包有限差分模拟步
#[tauri::command]
pub fn simulate_wave_step(
    mut height_map: Vec<f32>,
    mut velocity_map: Vec<f32>,
    width: usize,
    height: usize,
    c: f32,
    damping: f32,
    dt: f32,
) -> Vec<f32> {
    if height_map.len() != width * height || velocity_map.len() != width * height {
        return height_map;
    }

    let c_sq = c * c;
    let inv_dx_sq = 1.0;

    let laplacian: Vec<f32> = (0..height)
        .into_par_iter()
        .flat_map(|y| {
            let mut row_lap = vec![0.0f32; width];
            if y == 0 || y == height - 1 {
                return row_lap;
            }

            let y_up = (y - 1) * width;
            let y_mid = y * width;
            let y_down = (y + 1) * width;

            for x in 1..width - 1 {
                let center = height_map[y_mid + x];
                let left = height_map[y_mid + x - 1];
                let right = height_map[y_mid + x + 1];
                let up = height_map[y_up + x];
                let down = height_map[y_down + x];

                row_lap[x] = (left + right + up + down - 4.0 * center) * inv_dx_sq;
            }

            row_lap
        })
        .collect();

    for i in 0..height_map.len() {
        velocity_map[i] = (velocity_map[i] + laplacian[i] * c_sq * dt) * damping;
        height_map[i] += velocity_map[i] * dt;
    }

    height_map
}
