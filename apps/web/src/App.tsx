// apps/web/src/App.tsx
import { BrowserRouter, Routes, Route, NavLink, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import SearchBar from "./components/SearchBar";
import BriefPanel from "./components/BriefPanel";
import MapPage from "./pages/MapPage";
import SettingsModal from "./components/SettingsModal";
import { fetchBrief, type BriefResponse } from "./lib/api";

function HomePage() {
  // URL’den dep/arr geldiyse otomatik brief çek (sende vardı – aynen koruyorum)
  useEffect(() => {
    const u = new URL(window.location.href);
    const dep = u.searchParams.get("dep");
    const arr = u.searchParams.get("arr");
    if (!dep || !arr) return;

    (async () => {
      try {
        const brief: BriefResponse = await fetchBrief(dep, arr);
        localStorage.setItem("lastBrief", JSON.stringify(brief));
        const d = brief.airports.dep.coords;
        const a = brief.airports.arr.coords;
        if (d && a) {
          localStorage.setItem("lastRoute", JSON.stringify({ dep: d, arr: a }));
        }
        localStorage.setItem(
          "lastPair",
          JSON.stringify({
            depIcao: dep,
            arrIcao: arr,
            depLabel: dep,
            arrLabel: arr,
          })
        );
        window.dispatchEvent(new Event("flight-route-updated"));
      } catch {
        // sessiz geç
      }
    })();
  }, []);

  return (
    <main className="max-w-6xl mx-auto w-full px-4 py-4 space-y-4">
      <SearchBar />
      <BriefPanel />
      <div className="flex justify-end">
        <Link
          to="/map"
          className="rounded-md border border-sky-600/50 bg-sky-500/10 px-3 py-1.5 text-sm text-sky-200 hover:bg-sky-500/20"
        >
          Haritayı Tam Ekran Aç
        </Link>
      </div>
    </main>
  );
}

export default function App() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        {/* Header / Navbar */}
        <header className="h-14 flex items-center px-4 border-b border-zinc-800">
          <div className="max-w-6xl mx-auto w-full flex items-center gap-6">
            <Link to="/" className="font-semibold tracking-wide">Flight Risk</Link>
            <nav className="flex items-center gap-3 text-sm">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `px-2 py-1 rounded ${isActive ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`
                }
              >
                Brief
              </NavLink>
              <NavLink
                to="/map"
                className={({ isActive }) =>
                  `px-2 py-1 rounded ${isActive ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`
                }
              >
                Map
              </NavLink>
            </nav>

            {/* Sağ tarafa Settings */}
            <div className="ml-auto">
              <button
                onClick={() => setShowSettings(true)}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm hover:bg-zinc-800"
                title="Settings"
              >
                Settings
              </button>
            </div>
          </div>
        </header>

        {/* Routes */}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/map"
            element={
              <div className="w-full h-[calc(100vh-56px)]">
                <MapPage />
              </div>
            }
          />
        </Routes>

        {/* Modal */}
        <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
      </div>
    </BrowserRouter>
  );
}
