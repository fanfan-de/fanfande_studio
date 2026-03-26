import * as  Filesystem  from "@/util/filesystem";
import { lazy } from "@/util/lazy";
import { which } from "@/util/which"
import path from "path";

export namespace Shell {



    export const preferred = lazy(() => {
        const s = process.env.SHELL
        if (s) return s
        return fallback()
    })
    /**
     * 返回不同平台的shell可执行文件的路径
     */
    function fallback() {
        if (process.platform === "win32") {

            //优先gitbash
            const git = which("git")
            if (git) {
                const bash = path.join(git, "..", "..", "bin", "bash.exe")
                if (Filesystem.stat(bash)?.size) return bash
            }
            //次选
            return "cmd.exe"
        }
        //Mac system
        if (process.platform === "darwin") {
            return "/bin/zsh"
        }
        //linux
        if (process.platform === "linux") {
            const bash = which("bash")
            if (bash) return bash
            return "/bin/sh"
        }

    }
}