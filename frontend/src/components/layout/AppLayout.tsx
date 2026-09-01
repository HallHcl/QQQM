import { Outlet } from "react-router-dom";
import { SearchPaletteProvider } from "@/components/search/SearchPaletteProvider";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppLayout() {
  return (
    <SearchPaletteProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 overflow-y-auto bg-canvas p-4 sm:px-8 sm:py-7">
            {/* Content constrained to 1440px, centered within the already-padded
                main element. Padding stays at the viewport edge so there is no
                gap-less strip at wide viewports. */}
            <div className="mx-auto max-w-[1440px] w-full">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SearchPaletteProvider>
  );
}
