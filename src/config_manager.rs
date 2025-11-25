use std::fs;
use std::path::{Path, PathBuf};
use std::io::{self, Read, Write};
use uuid::Uuid;


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

        Ok(ConfigManager { config_dir })
    }

    fn get_config_dir() -> Result<PathBuf, io::Error> {
        let home_dir = dirs::home_dir()
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "Could not find home directory"))?;

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