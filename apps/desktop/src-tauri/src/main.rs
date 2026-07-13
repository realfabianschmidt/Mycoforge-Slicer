use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

#[derive(Serialize)]
struct CommandResult {
    status: i32,
    stdout: String,
    stderr: String,
    success: bool,
}

#[derive(Serialize)]
struct MaterialProfile {
    id: String,
    name: String,
    profile_path: String,
    line_width_mm: f64,
    layer_height_mm: f64,
    print_speed_mm_s: f64,
    travel_speed_mm_s: f64,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelTransform {
    #[serde(default)]
    translate_x_mm: f64,
    #[serde(default)]
    translate_y_mm: f64,
    #[serde(default)]
    translate_z_mm: f64,
    #[serde(default)]
    rotate_x_deg: f64,
    #[serde(default)]
    rotate_y_deg: f64,
    #[serde(default)]
    rotate_z_deg: f64,
    #[serde(default = "default_model_scale")]
    scale: f64,
    #[serde(default = "default_model_center_x")]
    center_x_mm: f64,
    #[serde(default = "default_model_center_y")]
    center_y_mm: f64,
}

#[derive(Clone, Copy)]
struct Triangle {
    vertices: [[f32; 3]; 3],
}

fn default_model_scale() -> f64 {
    1.0
}

fn default_model_center_x() -> f64 {
    125.0
}

fn default_model_center_y() -> f64 {
    125.0
}

#[tauri::command]
fn run_mycoforge(app: tauri::AppHandle, args: Vec<String>) -> Result<CommandResult, String> {
    let root = find_mycoforge_root(&app)?;
    let python = env::var("MYCOFORGE_PYTHON").unwrap_or_else(|_| "python".to_string());
    let tools_path = root.join("tools");
    let mut command = Command::new(python);
    command
        .arg("-m")
        .arg("mycoforge_cli.main")
        .args(args)
        .current_dir(&root)
        .env("PYTHONPATH", tools_path);

    if let Some(slicer_home) = bundled_slicer_home(&app, &root)? {
        command.env("MYCOFORGE_SLICER_HOME", slicer_home);
    }

    let output = command.output().map_err(|error| error.to_string())?;

    let status = output.status.code().unwrap_or(-1);
    Ok(CommandResult {
        status,
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        success: output.status.success(),
    })
}

#[tauri::command]
fn list_material_profiles(app: tauri::AppHandle) -> Result<Vec<MaterialProfile>, String> {
    let root = find_mycoforge_root(&app)?;
    let materials_dir = root.join("profiles").join("materials");
    let mut materials = Vec::new();

    for entry in fs::read_dir(&materials_dir).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let text = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        let json: Value = serde_json::from_str(&text).map_err(|error| error.to_string())?;
        materials.push(MaterialProfile {
            id: string_field(&json, "id", "unknown"),
            name: string_field(&json, "name", "Unknown"),
            profile_path: path.to_string_lossy().to_string(),
            line_width_mm: number_field(&json, "line_width_mm", 0.0),
            layer_height_mm: number_field(&json, "layer_height_mm", 0.0),
            print_speed_mm_s: number_field(&json, "print_speed_mm_s", 15.0),
            travel_speed_mm_s: number_field(&json, "travel_speed_mm_s", 80.0),
        });
    }

    materials.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(materials)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn prepare_transformed_stl(path: String, transform: ModelTransform) -> Result<String, String> {
    let input = PathBuf::from(&path);
    if input
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
        != Some("stl".to_string())
    {
        return Err("Model layout transforms currently support STL files only.".to_string());
    }

    let bytes = fs::read(&input).map_err(|error| error.to_string())?;
    let triangles = parse_stl(&bytes)?;
    if triangles.is_empty() {
        return Err("STL file did not contain any triangles.".to_string());
    }

    let transformed = transform_triangles(&triangles, transform);
    let output_dir = env::temp_dir().join("mycoforge-studio").join("layout");
    fs::create_dir_all(&output_dir).map_err(|error| error.to_string())?;

    let stem = input
        .file_stem()
        .and_then(|value| value.to_str())
        .map(sanitize_filename)
        .unwrap_or_else(|| "model".to_string());
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let output = output_dir.join(format!("{stem}_layout_{timestamp}.stl"));
    write_binary_stl(&output, &transformed)?;
    Ok(output.to_string_lossy().to_string())
}

#[tauri::command]
async fn pick_job_file(
    window: tauri::Window,
    dialog: tauri::State<'_, tauri_plugin_dialog::Dialog<tauri::Wry>>,
) -> Result<Option<String>, String> {
    dialog
        .file()
        .set_parent(&window)
        .set_title("Select job file")
        .add_filter("Job files", &["stl", "3mf", "gcode"])
        .blocking_pick_file()
        .map(|file_path| {
            file_path
                .into_path()
                .map(|path| path.to_string_lossy().to_string())
                .map_err(|error| error.to_string())
        })
        .transpose()
}

fn string_field(json: &Value, key: &str, fallback: &str) -> String {
    json.get(key)
        .and_then(Value::as_str)
        .unwrap_or(fallback)
        .to_string()
}

fn number_field(json: &Value, key: &str, fallback: f64) -> f64 {
    json.get(key).and_then(Value::as_f64).unwrap_or(fallback)
}

fn parse_stl(bytes: &[u8]) -> Result<Vec<Triangle>, String> {
    if is_binary_stl(bytes) {
        parse_binary_stl(bytes)
    } else {
        parse_ascii_stl(bytes)
    }
}

fn is_binary_stl(bytes: &[u8]) -> bool {
    if bytes.len() < 84 {
        return false;
    }
    let count = u32::from_le_bytes([bytes[80], bytes[81], bytes[82], bytes[83]]) as usize;
    84usize.saturating_add(count.saturating_mul(50)) == bytes.len()
}

fn parse_binary_stl(bytes: &[u8]) -> Result<Vec<Triangle>, String> {
    if bytes.len() < 84 {
        return Err("Binary STL is too short.".to_string());
    }

    let count = u32::from_le_bytes([bytes[80], bytes[81], bytes[82], bytes[83]]) as usize;
    let expected = 84usize
        .checked_add(
            count
                .checked_mul(50)
                .ok_or("Binary STL triangle count is too large.")?,
        )
        .ok_or("Binary STL size is too large.")?;
    if expected != bytes.len() {
        return Err("Binary STL size does not match its triangle count.".to_string());
    }

    let mut triangles = Vec::with_capacity(count);
    let mut offset = 84;
    for _ in 0..count {
        offset += 12;
        let mut vertices = [[0.0; 3]; 3];
        for vertex in &mut vertices {
            for component in vertex {
                *component = read_f32_le(bytes, offset)?;
                offset += 4;
            }
        }
        offset += 2;
        triangles.push(Triangle { vertices });
    }
    Ok(triangles)
}

fn parse_ascii_stl(bytes: &[u8]) -> Result<Vec<Triangle>, String> {
    let text = std::str::from_utf8(bytes).map_err(|error| error.to_string())?;
    let mut vertices = Vec::new();

    for line in text.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("vertex ") {
            continue;
        }
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() != 4 {
            return Err(format!("Invalid STL vertex line: {trimmed}"));
        }
        vertices.push([
            parts[1].parse::<f32>().map_err(|error| error.to_string())?,
            parts[2].parse::<f32>().map_err(|error| error.to_string())?,
            parts[3].parse::<f32>().map_err(|error| error.to_string())?,
        ]);
    }

    if vertices.len() % 3 != 0 {
        return Err("ASCII STL vertex count is not divisible by 3.".to_string());
    }

    Ok(vertices
        .chunks_exact(3)
        .map(|chunk| Triangle {
            vertices: [chunk[0], chunk[1], chunk[2]],
        })
        .collect())
}

fn read_f32_le(bytes: &[u8], offset: usize) -> Result<f32, String> {
    let end = offset.checked_add(4).ok_or("STL offset overflow.")?;
    let chunk = bytes
        .get(offset..end)
        .ok_or("Unexpected end of binary STL.")?;
    Ok(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
}

fn transform_triangles(triangles: &[Triangle], transform: ModelTransform) -> Vec<Triangle> {
    let (min, max) = triangle_bounds(triangles);
    let center_x = (min[0] + max[0]) / 2.0;
    let center_y = (min[1] + max[1]) / 2.0;
    let rx = transform.rotate_x_deg.to_radians();
    let ry = transform.rotate_y_deg.to_radians();
    let rz = transform.rotate_z_deg.to_radians();
    let (sin_x, cos_x) = rx.sin_cos();
    let (sin_y, cos_y) = ry.sin_cos();
    let (sin_z, cos_z) = rz.sin_cos();
    let scale = if transform.scale.is_finite() && transform.scale > 0.0 {
        transform.scale
    } else {
        1.0
    };
    let tx = transform.center_x_mm + transform.translate_x_mm;
    let ty = transform.center_y_mm + transform.translate_y_mm;

    let mut transformed: Vec<Triangle> = triangles
        .iter()
        .map(|triangle| {
            let mut vertices = [[0.0; 3]; 3];
            for (index, vertex) in triangle.vertices.iter().enumerate() {
                let x = f64::from(vertex[0] - center_x) * scale;
                let y = f64::from(vertex[1] - center_y) * scale;
                let z = f64::from(vertex[2] - min[2]) * scale;
                let rotated = rotate_xyz(x, y, z, sin_x, cos_x, sin_y, cos_y, sin_z, cos_z);
                vertices[index] = [rotated.0 as f32, rotated.1 as f32, rotated.2 as f32];
            }
            Triangle { vertices }
        })
        .collect();

    let (transformed_min, _) = triangle_bounds(&transformed);
    let floor_z = transform.translate_z_mm - f64::from(transformed_min[2]);
    for triangle in &mut transformed {
        for vertex in &mut triangle.vertices {
            vertex[0] = (f64::from(vertex[0]) + tx) as f32;
            vertex[1] = (f64::from(vertex[1]) + ty) as f32;
            vertex[2] = (f64::from(vertex[2]) + floor_z) as f32;
        }
    }
    transformed
}

#[allow(clippy::too_many_arguments)]
fn rotate_xyz(
    x: f64,
    y: f64,
    z: f64,
    sin_x: f64,
    cos_x: f64,
    sin_y: f64,
    cos_y: f64,
    sin_z: f64,
    cos_z: f64,
) -> (f64, f64, f64) {
    let y1 = y * cos_x - z * sin_x;
    let z1 = y * sin_x + z * cos_x;
    let x2 = x * cos_y + z1 * sin_y;
    let z2 = -x * sin_y + z1 * cos_y;
    let x3 = x2 * cos_z - y1 * sin_z;
    let y3 = x2 * sin_z + y1 * cos_z;
    (x3, y3, z2)
}

fn triangle_bounds(triangles: &[Triangle]) -> ([f32; 3], [f32; 3]) {
    let mut min = [f32::INFINITY; 3];
    let mut max = [f32::NEG_INFINITY; 3];
    for triangle in triangles {
        for vertex in triangle.vertices {
            for axis in 0..3 {
                min[axis] = min[axis].min(vertex[axis]);
                max[axis] = max[axis].max(vertex[axis]);
            }
        }
    }
    (min, max)
}

fn write_binary_stl(path: &Path, triangles: &[Triangle]) -> Result<(), String> {
    let mut file = fs::File::create(path).map_err(|error| error.to_string())?;
    let mut header = [0u8; 80];
    let label = b"Mycoforge transformed STL";
    header[..label.len()].copy_from_slice(label);
    file.write_all(&header).map_err(|error| error.to_string())?;
    file.write_all(&(triangles.len() as u32).to_le_bytes())
        .map_err(|error| error.to_string())?;

    for triangle in triangles {
        let normal = normal_for(triangle.vertices);
        for value in normal {
            file.write_all(&value.to_le_bytes())
                .map_err(|error| error.to_string())?;
        }
        for vertex in triangle.vertices {
            for value in vertex {
                file.write_all(&value.to_le_bytes())
                    .map_err(|error| error.to_string())?;
            }
        }
        file.write_all(&0u16.to_le_bytes())
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn normal_for(vertices: [[f32; 3]; 3]) -> [f32; 3] {
    let a = [
        vertices[1][0] - vertices[0][0],
        vertices[1][1] - vertices[0][1],
        vertices[1][2] - vertices[0][2],
    ];
    let b = [
        vertices[2][0] - vertices[0][0],
        vertices[2][1] - vertices[0][1],
        vertices[2][2] - vertices[0][2],
    ];
    let normal = [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
    let length = (normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]).sqrt();
    if length == 0.0 {
        [0.0, 0.0, 0.0]
    } else {
        [normal[0] / length, normal[1] / length, normal[2] / length]
    }
}

fn sanitize_filename(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect()
}

fn find_mycoforge_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(root) = env::var("MYCOFORGE_ROOT").map(PathBuf::from) {
        if is_mycoforge_root(&root) {
            return Ok(root);
        }
        return Err(format!(
            "MYCOFORGE_ROOT does not contain tools and profiles: {}",
            root.display()
        ));
    }

    if let Ok(current_dir) = env::current_dir() {
        if let Some(root) = find_root_from_ancestors(&current_dir) {
            return Ok(root);
        }
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        if is_mycoforge_root(&resource_dir) {
            return Ok(resource_dir);
        }
        if let Some(root) = find_root_from_ancestors(&resource_dir) {
            return Ok(root);
        }
    }

    Err("Could not find Mycoforge tools and profiles in MYCOFORGE_ROOT, the current directory, or bundled resources.".to_string())
}

fn find_root_from_ancestors(start: &Path) -> Option<PathBuf> {
    for candidate in start.ancestors() {
        if is_mycoforge_root(candidate) {
            return Some(candidate.to_path_buf());
        }
    }
    None
}

fn is_mycoforge_root(path: &Path) -> bool {
    path.join("tools").join("mycoforge_cli").is_dir()
        && path.join("profiles").join("materials").is_dir()
}

fn bundled_slicer_home(app: &tauri::AppHandle, root: &Path) -> Result<Option<PathBuf>, String> {
    if env::var_os("MYCOFORGE_SLICER_HOME").is_some() || root.join(".git").is_dir() {
        return Ok(None);
    }

    let slicer_home = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?
        .join("slicers");
    fs::create_dir_all(&slicer_home).map_err(|error| error.to_string())?;
    Ok(Some(slicer_home))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            run_mycoforge,
            list_material_profiles,
            read_text_file,
            read_binary_file,
            prepare_transformed_stl,
            pick_job_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mycoforge Studio");
}
