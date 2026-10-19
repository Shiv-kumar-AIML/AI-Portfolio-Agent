import { Component, type ReactNode } from 'react'

/** Renders `fallback` instead of crashing when anything below fails (e.g. a lazy 3D chunk, WebGL). */
export class FallbackBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
