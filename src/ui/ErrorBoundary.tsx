import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  title?: string;
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/** Catches render errors so one broken tool never takes the whole studio (or project data) down. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[OmniDesign] Erro capturado:', error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="panel max-w-lg p-6">
          <h2 className="text-lg font-semibold">{this.props.title ?? 'Algo deu errado'}</h2>
          <p className="mt-2 text-sm text-ink-300">
            O erro foi isolado. Seus projetos salvos não foram afetados — o salvamento automático grava cada alteração no armazenamento local.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded bg-ink-950 p-3 text-xs text-red-300">{this.state.error.message}</pre>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary" onClick={this.reset}>Tentar novamente</button>
            <button className="btn-outline" onClick={() => window.location.assign(import.meta.env.BASE_URL)}>Voltar ao Dashboard</button>
          </div>
        </div>
      </div>
    );
  }
}
