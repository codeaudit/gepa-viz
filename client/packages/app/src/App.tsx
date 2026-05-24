import { RunProvider } from "@gepa-viz/react";
import AppRoutes from "./routes";

export default function App() {
  return (
    <RunProvider>
      <AppRoutes />
    </RunProvider>
  );
}
