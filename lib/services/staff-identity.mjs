// This resolver must run with a server client and its request cookies, never browser metadata.
export async function validatedStaff(client) {
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user?.id) return null;
    const { data: profile, error: profileError } = await client
      .schema("carebridge")
      .from("staff_profiles")
      .select("id,role,active,full_name")
      .eq("id", data.user.id)
      .maybeSingle();
    if (
      profileError ||
      !profile ||
      profile.id !== data.user.id ||
      profile.active !== true ||
      !["doctor", "assistant"].includes(profile.role)
    )
      return null;
    return {
      role: profile.role,
      fullName:
        typeof profile.full_name === "string" ? profile.full_name : "Staff",
    };
  } catch {
    return null;
  }
}
export function permitsRole(staff, required) {
  return Boolean(staff && (!required || staff.role === required));
}
