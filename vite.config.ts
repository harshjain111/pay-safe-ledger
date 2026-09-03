import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = env.VITE_SUPABASE_URL || "https://tvjcyntqgbipennzbxgt.supabase.co";
  const supabasePublishableKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2amN5bnRxZ2JpcGVubnpieGd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMDQ3MDUsImV4cCI6MjA5NTc4MDcwNX0.U7dmXpV7Lqi1nqAqc5z0PWgmmX-oO2JIhWaHv_xRl0U";

  return {
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: {
    rollupOptions: {
      output: {
        // Split the three big, rarely-changing vendor groups out of the entry
        // chunk. This does not reduce first-load bytes — it means a deploy that
        // only touches app code leaves these three still cached in returning
        // users' browsers instead of re-downloading ~150 KB gzipped.
        //
        // Deliberately coarse. Finer splitting risks load-order problems for no
        // extra benefit, and everything here is needed on the first paint
        // anyway, so separating them costs nothing on a cold visit.
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
          "query-vendor": ["@tanstack/react-query"],
        },
      },
    },
  },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
      env.VITE_SUPABASE_PROJECT_ID || "tvjcyntqgbipennzbxgt"
    ),
  },
};
});
