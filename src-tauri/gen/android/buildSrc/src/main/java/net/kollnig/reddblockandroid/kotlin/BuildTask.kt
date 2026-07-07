import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val executable = """npm""";
        try {
            runTauriCli(executable)
        } catch (e: Exception) {
            if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                // Try different Windows-specific extensions
                val fallbacks = listOf(
                    "$executable.exe",
                    "$executable.cmd",
                    "$executable.bat",
                )

                var lastException: Exception = e
                for (fallback in fallbacks) {
                    try {
                        runTauriCli(fallback)
                        return
                    } catch (fallbackException: Exception) {
                        lastException = fallbackException
                    }
                }
                throw lastException
            } else {
                throw e;
            }
        }
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val args = listOf("run", "--", "tauri", "android", "android-studio-script");

        project.exec {
            workingDir(File(project.projectDir, rootDirRel))
            executable(executable)
            // Android Studio launched from the Dock doesn't inherit the shell PATH,
            // so node (nvm) and cargo would not be found without this.
            val home = System.getProperty("user.home")
            val nodeBin = File("$home/.nvm/versions/node")
                .listFiles { f -> f.isDirectory }
                ?.maxByOrNull { f ->
                    f.name.removePrefix("v").split(".")
                        .map { it.toIntOrNull() ?: 0 }
                        .let { v -> v.getOrElse(0) { 0 } * 1_000_000 + v.getOrElse(1) { 0 } * 1_000 + v.getOrElse(2) { 0 } }
                }
                ?.let { "${it.absolutePath}/bin" }
            val extraPaths = listOfNotNull(nodeBin, "$home/.cargo/bin", "/opt/homebrew/bin", "/usr/local/bin")
                .filter { File(it).isDirectory }
            environment("PATH", (extraPaths + System.getenv("PATH")).joinToString(File.pathSeparator))
            args(args)
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }
}
