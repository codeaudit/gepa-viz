import { RunProvider } from "gepa-viz";
import AppRoutes from "./routes";

export default function App() {
  return (
    <RunProvider>
      <AppRoutes />
    </RunProvider>
  );
}
