// Application vocabulary. Generate Supabase query types with npm run db:types
// once a local Supabase instance is available; do not hand-write generated types.
export type UserRole = "user" | "admin";
export type PresentationStatus = "upcoming" | "completed" | "cancelled";
export type PresentationFileKind = "powerpoint" | "pdf";
