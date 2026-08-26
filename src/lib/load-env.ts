import fs from "node:fs";
import path from "node:path";

export function loadEnvFile() {
  try {
    const cwd = process.cwd();
    const envPath = path.join(cwd, ".env");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const idx = trimmed.indexOf("=");
          const key = trimmed.slice(0, idx).trim();
          let val = trimmed.slice(idx + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          if (key) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {
    // Ignore in non-Node environments (e.g. browser)
  }
}

loadEnvFile();
