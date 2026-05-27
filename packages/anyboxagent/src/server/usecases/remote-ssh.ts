import z from "zod"
import { createSshWorkspaceUri, normalizeSshRemotePath } from "@anybox/shared"
import { ApiError } from "#server/error.ts"
import * as Ssh from "#remote/ssh/index.ts"

export const SaveSshProfileBody = Ssh.SshProfileInput

export const SshDirectoryQuery = z.object({
  path: z.string().optional(),
})

export async function listSshProfiles() {
  return Ssh.listProfiles()
}

export async function saveSshProfile(input: z.infer<typeof SaveSshProfileBody>) {
  return Ssh.saveProfile(input)
}

export async function deleteSshProfile(profileID: string) {
  return Ssh.deleteProfile(profileID)
}

export async function testSshProfile(profileID: string) {
  return Ssh.testConnection(profileID)
}

export async function listSshDirectory(profileID: string, input: z.infer<typeof SshDirectoryQuery>) {
  const profile = await Ssh.getProfile(profileID)
  if (!profile) throw new ApiError(404, "SSH_PROFILE_NOT_FOUND", "SSH profile not found")

  const requestedPath = normalizeSshRemotePath(input.path || profile.defaultRemotePath || "/")
  const uri = createSshWorkspaceUri(profileID, requestedPath)
  const entries = await Ssh.listDirectory(uri)
  return {
    profileID,
    path: requestedPath,
    entries,
  }
}
