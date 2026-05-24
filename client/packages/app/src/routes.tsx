import { Link, Route, Routes } from "react-router-dom";
import CandidatePage from "./pages/CandidatePage";
import GraphPage from "./pages/GraphPage";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<GraphPage />} />
      <Route path="/candidate/:id" element={<CandidatePage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 text-sm text-zinc-600 dark:text-zinc-400">
      <Link
        to="/"
        className="text-xs uppercase tracking-wide text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← back to graph
      </Link>
      <p className="mt-6">not found.</p>
    </div>
  );
}
