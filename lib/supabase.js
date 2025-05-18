// supabase.js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  throw new Error('❌ Missing Supabase env variables');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
