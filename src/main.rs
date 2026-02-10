// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();

    // If we have arguments (more than just the executable path), run CLI mode
    if args.len() > 1 {
        // Try to attach to parent console to show output
        #[cfg(target_os = "windows")]
        unsafe {
            // Manually link to kernel32 to avoid dependency issues
            #[link(name = "kernel32")]
            extern "system" {
                fn AttachConsole(dwProcessId: u32) -> i32;
            }
            const ATTACH_PARENT_PROCESS: u32 = u32::MAX;

            AttachConsole(ATTACH_PARENT_PROCESS);
        }

        // Run CLI and exit with the returned status code
        let code = rivals_st_editor_lib::cli::run_cli(args);
        std::process::exit(code);
    }

    // Otherwise, run the GUI app
    rivals_st_editor_lib::run()
}
