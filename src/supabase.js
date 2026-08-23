import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://lodkrtdnremuahivhwsr.supabase.co";
const SUPABASE_KEY = "sb_publishable_NyDsFJTUzisprmir8yZlXw_Z5UjD4D2";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
