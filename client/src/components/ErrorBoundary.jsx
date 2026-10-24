import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card error-card">
        <h3>Terjadi kesalahan pada tampilan</h3>
        <p>{String(this.state.error.message || this.state.error)}</p>
        <button onClick={() => this.setState({ error: null })}>Muat ulang komponen</button>
      </div>
    );
  }
}