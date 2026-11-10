import { Component } from 'react';
import type { ReactNode } from 'react';

/**
 * Si una pantalla falla, se muestra un aviso en lugar de dejar la app en blanco. Los datos no se tocan: siguen en el
 * dispositivo. El mensaje no incluye datos del alumnado.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card empty" style={{ margin: 24 }}>
        <b>Algo ha fallado en esta pantalla</b>
        <p className="mute">Tus datos están a salvo en el dispositivo. Recarga la app; si se repite, copia este mensaje para avisar del error.</p>
        <p className="warn">{this.state.error.message}</p>
        <button className="on" onClick={() => location.reload()}>Recargar</button>
      </div>
    );
  }
}
