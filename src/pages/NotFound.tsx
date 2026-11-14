import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <Link to="/" className="btn-primary">Ir para o Dashboard</Link>
    </div>
  );
}
