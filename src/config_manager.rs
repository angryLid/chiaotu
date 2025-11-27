use include_dir::{Dir, include_dir};
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;
use axum::{
    http::{header, StatusCode},
    response::Response,
    routing::{get, Router},
    serve,
};

static EMBEDDED_RESOURCES: Dir = include_dir!("resources");

fn extract_embedded_file(
    embedded_file: &include_dir::File,
    destination: &Path,
) -> Result<(), io::Error> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut file = fs::File::create(destination)?;
    file.write_all(embedded_file.contents())?;
    Ok(())
}

fn extract_embedded_dir(
    embedded_dir: &include_dir::Dir,
    destination: &Path,
) -> Result<(), io::Error> {
    if !destination.exists() {
        fs::create_dir_all(destination)?;
    }

    for entry in embedded_dir.entries() {
        match entry {
            include_dir::DirEntry::Dir(dir) => {
                let dest_path = destination.join(dir.path().file_name().unwrap());
                extract_embedded_dir(dir, &dest_path)?;
            }
            include_dir::DirEntry::File(file) => {
                let dest_path = destination.join(file.path().file_name().unwrap());
                extract_embedded_file(file, &dest_path)?;
            }
        }
    }
    Ok(())
}

fn copy_recursively(source: &Path, destination: &Path) -> Result<(), io::Error> {
    if source.is_dir() {
        if !destination.exists() {
            fs::create_dir_all(destination)?;
        }

        for entry in fs::read_dir(source)? {
            let entry = entry?;
            let file_type = entry.file_type()?;
            let source_path = entry.path();
            let destination_path = destination.join(entry.file_name());

            if file_type.is_dir() {
                copy_recursively(&source_path, &destination_path)?;
            } else {
                fs::copy(&source_path, &destination_path)?;
            }
        }
    } else {
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(source, destination)?;
    }
    Ok(())
}

pub struct ConfigManager {
    config_dir: PathBuf,
}

impl ConfigManager {
    pub fn new() -> Result<Self, io::Error> {
        let config_dir = Self::get_config_dir()?;

        if !config_dir.exists() {
            fs::create_dir_all(&config_dir)?;
            println!("Created config directory: {}", config_dir.display());
        }

        let manager = ConfigManager { config_dir };

        // Check if resources folder exists, if not extract embedded files
        let resources_dir = manager.config_dir.join("resources");
      
            manager.extract_resources()?;
        

        Ok(manager)
    }

    fn get_config_dir() -> Result<PathBuf, io::Error> {
        let home_dir = dirs::home_dir().ok_or_else(|| {
            io::Error::new(io::ErrorKind::NotFound, "Could not find home directory")
        })?;

        Ok(home_dir.join(".config").join("chiaotu"))
    }

    pub fn get_config_dir_path(&self) -> &Path {
        &self.config_dir
    }

    pub fn config_file_path(&self, filename: &str) -> PathBuf {
        self.config_dir.join(filename)
    }

    pub fn read_config_file(&self, filename: &str) -> Result<String, io::Error> {
        let file_path = self.config_file_path(filename);

        if !file_path.exists() {
            return Ok(String::new());
        }

        let mut content = String::new();
        let mut file = fs::File::open(file_path)?;
        file.read_to_string(&mut content)?;

        Ok(content)
    }

    pub fn write_config_file(&self, filename: &str, content: &str) -> Result<(), io::Error> {
        let file_path = self.config_file_path(filename);

        let mut file = fs::File::create(file_path)?;
        file.write_all(content.as_bytes())?;

        Ok(())
    }

    pub fn list_config_files(&self) -> Result<Vec<String>, io::Error> {
        let mut files = Vec::new();

        if self.config_dir.exists() {
            for entry in fs::read_dir(&self.config_dir)? {
                let entry = entry?;
                let path = entry.path();

                if path.is_file() {
                    if let Some(file_name) = path.file_name().and_then(|name| name.to_str()) {
                        files.push(file_name.to_string());
                    }
                }
            }
        }

        Ok(files)
    }

    pub fn delete_config_file(&self, filename: &str) -> Result<(), io::Error> {
        let file_path = self.config_file_path(filename);

        if file_path.exists() {
            fs::remove_file(file_path)?;
        }

        Ok(())
    }

    pub fn ensure_config_directory(&self) -> Result<(), io::Error> {
        if !self.config_dir.exists() {
            fs::create_dir_all(&self.config_dir)?;
            println!("Config directory ensured at: {}", self.config_dir.display());
        }
        Ok(())
    }

    pub fn cache(&self, filename: &str, content: &str) -> Result<(), io::Error> {
        // let uuid = Uuid::new_v4();
        let filename = format!("{}.yml", filename);
        let file_path = self.config_dir.join(filename);

        fs::write(file_path, content)?;
        Ok(())
    }

    pub fn load_cache(&self) -> Result<Vec<(String, String)>, io::Error> {
        let mut contents = Vec::new();

        if !self.config_dir.exists() {
            return Ok(contents);
        }

        for entry in fs::read_dir(&self.config_dir)? {
            let entry = entry?;
            let path = entry.path();

            // Check if it's a file and ends with .yml
            if path.is_file() && path.extension().map_or(false, |ext| ext == "yml") {
                let content = fs::read_to_string(&path)?;

                let filename = path.file_stem()
    .map(|s| s.to_string_lossy())
    .unwrap_or_default().to_string();
                let t = (
                    filename,
                    // I want the path to generate file name here
                    content
                );
                contents.push(t);
            }
        }

        Ok(contents)
    }
    pub fn load_rules(&self) -> Result<Vec<String>, io::Error> {
        let mut contents = Vec::new();

        if !self.config_dir.exists() {
            return Ok(contents);
        }

        let path = self.config_dir
        .join("resources")
        .join("rules");
        for entry in fs::read_dir(&path)? {
            let entry = entry?;
            let path = entry.path();

            // Check if it's a file and ends with .yml
            if path.is_file() && path.extension().map_or(false, |ext| ext == "yml") {
                let content = fs::read_to_string(&path)?;
                contents.push(content);
            }
        }

        Ok(contents)
    }

    pub fn load_base_template(&self) -> Result<String, io::Error> {
        let default_template_path = self
            .config_dir
            .join("resources")
            .join("templates")
            .join("default.yml");

        if !default_template_path.exists() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!(
                    "Default template not found at: {}",
                    default_template_path.display()
                ),
            ));
        }

        fs::read_to_string(&default_template_path)
    }

    pub fn save_result(&self, content: &str) -> Result<(), io::Error> {
        use chrono::Utc;

        // if &self.config_dir/results doesn't exist, create the folder first,
        let results_dir = self.config_dir.join("results");
        if !results_dir.exists() {
            fs::create_dir_all(&results_dir)?;
        }

        // generate a file name format yyyy-MM-dd-HH-mm-ss.yml (UTC+8)
        let now = Utc::now();
        let now_plus_8 = now.with_timezone(&chrono::FixedOffset::east_opt(8 * 3600).unwrap());
        let filename = format!("{}.yaml", now_plus_8.format("%Y-%m-%d-%H-%M-%S"));
        let file_path = results_dir.join(filename);

        // save the content to the file
        fs::write(file_path, content)?;
        fs::write("chiaotu.yaml", content)?;
        Ok(())
    }

    pub fn extract_resources(&self) -> Result<(), io::Error> {
        // Create resources directory if it doesn't exist
        let resources_dir = self.config_dir.join("resources");
        if !resources_dir.exists() {
            fs::create_dir_all(&resources_dir)?;
        }

        // Try to extract embedded resources first (for distributed binary)
        if !EMBEDDED_RESOURCES.entries().is_empty() {
            extract_embedded_dir(&EMBEDDED_RESOURCES, &resources_dir)?;
        } else {
            // Fallback to copying from local resources directory (for development)
            let project_resources = PathBuf::from("resources");
            if project_resources.exists() {
                copy_recursively(&project_resources, &resources_dir)?;
            }
        }

        println!("Resources extracted to: {}", resources_dir.display());
        Ok(())
    }

}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;

    #[test]
    fn test_config_manager_creation() {
        let temp_home = tempdir().unwrap();

        let config_manager = ConfigManager::new();
        assert!(config_manager.is_ok());

        let manager = config_manager.unwrap();
        assert!(manager.get_config_dir_path().exists());
        assert!(manager.get_config_dir_path().ends_with(".config/chiaotu"));
    }

    #[test]
    fn test_read_write_config() {
        let temp_home = tempdir().unwrap();

        let manager = ConfigManager::new().unwrap();
        let test_content = "test configuration content";

        let write_result = manager.write_config_file("test.conf", test_content);
        assert!(write_result.is_ok());

        let read_content = manager.read_config_file("test.conf");
        assert!(read_content.is_ok());
        assert_eq!(read_content.unwrap(), test_content);
    }
}
