/**
 * Typed database schema for the Supabase client, mirroring what `supabase gen
 * types` emits for the migrations under supabase/migrations/. Passed as the
 * Database generic to @supabase/server's context creation so ctx.supabaseAdmin
 * queries are checked against real column shapes.
 *
 * bigint identity columns -> number; timestamptz -> string (RFC3339).
 * `generated always as identity` columns are omitted from Insert.
 */

export interface Database {
	public: {
		Tables: {
			subscriptions: {
				Row: {
					id: number;
					name: string;
					url: string;
					content: string;
					created_at: string;
					updated_at: string;
					deleted_at: string | null;
				};
				Insert: {
					name?: string;
					url?: string;
					content?: string;
					deleted_at?: string | null;
				};
				Update: Partial<{
					name: string;
					url: string;
					content: string;
					deleted_at: string | null;
				}>;
				Relationships: [];
			};
			rules: {
				Row: {
					id: number;
					name: string;
					filter: unknown;
					created_at: string;
					updated_at: string;
					deleted_at: string | null;
				};
				Insert: {
					name: string;
					filter?: unknown;
				};
				Update: Partial<{
					name: string;
					filter: unknown;
					deleted_at: string | null;
				}>;
				Relationships: [];
			};
			generated: {
				Row: {
					id: number;
					name: string;
					display_name: string | null;
					content: string;
					created_at: string;
					updated_at: string;
					deleted_at: string | null;
				};
				Insert: {
					name: string;
					display_name?: string | null;
					content: string;
				};
				Update: Partial<{
					name: string;
					display_name: string | null;
					content: string;
					deleted_at: string | null;
				}>;
				Relationships: [];
			};
			hosts_profiles: {
				Row: {
					id: number;
					name: string;
					created_at: string;
					updated_at: string;
					deleted_at: string | null;
				};
				Insert: { name: string };
				Update: Partial<{ name: string; deleted_at: string | null }>;
				Relationships: [];
			};
			hosts_entries: {
				Row: {
					id: number;
					profile_id: number;
					domain: string;
					ip: string;
					enabled: boolean;
					created_at: string;
					updated_at: string;
					deleted_at: string | null;
				};
				Insert: {
					profile_id: number;
					domain: string;
					ip?: string;
					enabled?: boolean;
				};
				Update: Partial<{
					domain: string;
					ip: string;
					enabled: boolean;
					deleted_at: string | null;
				}>;
				Relationships: [
					{
						foreignKeyName: "hosts_entries_profile_id_fkey";
						columns: ["profile_id"];
						isOneToOne: false;
						referencedRelation: "hosts_profiles";
						referencedColumns: ["id"];
					},
				];
			};
		};
		Views: Record<string, never>;
		Functions: {
			soft_delete_hosts_profile: {
				Args: { p_profile_id: number };
				Returns: boolean;
			};
		};
		Enums: Record<string, never>;
		CompositeTypes: Record<string, never>;
	};
}
