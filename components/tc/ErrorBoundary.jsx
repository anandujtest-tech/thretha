'use client'

import React from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error(
      `[ErrorBoundary: ${this.props.sectionName || 'Component'}] Caught error:`,
      error?.message || error,
      errorInfo
    )
  }

  resetError = () => {
    this.setState({ hasError: false, error: null })
    if (typeof this.props.onReset === 'function') {
      this.props.onReset()
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback({ error: this.state.error, reset: this.resetError })
          : this.props.fallback
      }

      return (
        <div className="border border-ink/10 bg-sand/20 p-6 text-center space-y-3 my-4">
          <div className="mx-auto w-8 h-8 rounded-full bg-sand/60 flex items-center justify-center text-cocoa">
            <AlertCircle className="w-4 h-4 text-gold-dark" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-ink">
              {this.props.sectionName
                ? `Something went wrong loading this ${this.props.sectionName.toLowerCase()}`
                : 'Something went wrong with this section.'}
            </p>
            <p className="text-[11px] text-cocoa">
              Please try refreshing this section or reloading the page.
            </p>
          </div>
          <button
            type="button"
            onClick={this.resetError}
            className="inline-flex items-center gap-1.5 bg-ink text-cream px-4 py-2 text-[10px] uppercase tracking-wider font-medium hover:bg-cocoa transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary

