import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Login from '../Login'

// Mock the API service
vi.mock('../../services/api', () => ({
  default: {
    isDemoMode: vi.fn(() => false)
  }
}))

describe('Login Component', () => {
  const mockOnLogin = vi.fn()

  beforeEach(() => {
    mockOnLogin.mockClear()
    localStorage.clear()
  })

  it('renders login form by default', () => {
    render(<Login onLogin={mockOnLogin} />)

    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('displays validation errors for empty fields', async () => {
    const user = userEvent.setup()
    render(<Login onLogin={mockOnLogin} />)

    const signInButton = screen.getByRole('button', { name: /sign in/i })
    await user.click(signInButton)

    expect(screen.getByText(/username is required/i)).toBeInTheDocument()
    expect(screen.getByText(/password is required/i)).toBeInTheDocument()
  })

  it('handles successful demo login', async () => {
    const user = userEvent.setup()
    render(<Login onLogin={mockOnLogin} />)

    await user.type(screen.getByLabelText(/username/i), 'demo')
    await user.type(screen.getByLabelText(/password/i), 'demo123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockOnLogin).toHaveBeenCalledWith({
        username: 'demo',
        name: 'Demo User',
        email: 'demo@example.com',
        id: 'demo-user-id'
      })
    })
  })

  it('displays error for invalid credentials', async () => {
    const user = userEvent.setup()
    render(<Login onLogin={mockOnLogin} />)

    await user.type(screen.getByLabelText(/username/i), 'invaliduser')
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument()
    })
    expect(mockOnLogin).not.toHaveBeenCalled()
  })

  it('switches to signup view when clicking create account', async () => {
    const user = userEvent.setup()
    render(<Login onLogin={mockOnLogin} />)

    await user.click(screen.getByRole('button', { name: /create new account/i }))

    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
  })

  it('validates signup form fields', async () => {
    const user = userEvent.setup()
    render(<Login onLogin={mockOnLogin} />)

    // Switch to signup
    await user.click(screen.getByRole('button', { name: /create new account/i }))

    // Try to submit empty form
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(screen.getByText(/full name is required/i)).toBeInTheDocument()
    expect(screen.getByText(/username is required/i)).toBeInTheDocument()
    expect(screen.getByText(/email is required/i)).toBeInTheDocument()
    expect(screen.getByText(/password is required/i)).toBeInTheDocument()
  })

  it('validates password confirmation in signup', async () => {
    const user = userEvent.setup()
    render(<Login onLogin={mockOnLogin} />)

    // Switch to signup
    await user.click(screen.getByRole('button', { name: /create new account/i }))

    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'differentpassword')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
  })

  it('validates email format in signup', async () => {
    const user = userEvent.setup()
    render(<Login onLogin={mockOnLogin} />)

    // Switch to signup
    await user.click(screen.getByRole('button', { name: /create new account/i }))

    await user.type(screen.getByLabelText(/email/i), 'invalid-email')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument()
  })

  it('handles successful signup', async () => {
    const user = userEvent.setup()
    render(<Login onLogin={mockOnLogin} />)

    // Switch to signup
    await user.click(screen.getByRole('button', { name: /create new account/i }))

    // Fill out form
    await user.type(screen.getByLabelText(/full name/i), 'John Doe')
    await user.type(screen.getByLabelText(/username/i), 'johndoe')
    await user.type(screen.getByLabelText(/email/i), 'john@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password123')

    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(mockOnLogin).toHaveBeenCalledWith({
        username: 'johndoe',
        name: 'John Doe',
        email: 'john@example.com',
        id: expect.any(String)
      })
    })
  })

  it('switches to forgot password view', async () => {
    const user = userEvent.setup()
    render(<Login onLogin={mockOnLogin} />)

    await user.click(screen.getByText(/forgot password/i))

    expect(screen.getByRole('heading', { name: /forgot password/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send reset code/i })).toBeInTheDocument()
  })

  it('handles forgot password flow', async () => {
    const user = userEvent.setup()
    render(<Login onLogin={mockOnLogin} />)

    // Go to forgot password
    await user.click(screen.getByText(/forgot password/i))

    // Enter email
    await user.type(screen.getByLabelText(/email/i), 'user@example.com')
    await user.click(screen.getByRole('button', { name: /send reset code/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument()
      expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument()
    })
  })

  it('validates reset password form', async () => {
    const user = userEvent.setup()
    render(<Login onLogin={mockOnLogin} />)

    // Navigate to reset password
    await user.click(screen.getByText(/forgot password/i))
    await user.type(screen.getByLabelText(/email/i), 'user@example.com')
    await user.click(screen.getByRole('button', { name: /send reset code/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument()
    })

    // Try to submit without filling fields
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    expect(screen.getByText(/verification code is required/i)).toBeInTheDocument()
    expect(screen.getByText(/new password is required/i)).toBeInTheDocument()
  })

  it('validates password confirmation in reset', async () => {
    const user = userEvent.setup()
    render(<Login onLogin={mockOnLogin} />)

    // Navigate to reset password
    await user.click(screen.getByText(/forgot password/i))
    await user.type(screen.getByLabelText(/email/i), 'user@example.com')
    await user.click(screen.getByRole('button', { name: /send reset code/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/verification code/i), '123456')
    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm new password/i), 'differentpassword')
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
  })

  it('handles successful password reset', async () => {
    const user = userEvent.setup()
    render(<Login onLogin={mockOnLogin} />)

    // Navigate to reset password
    await user.click(screen.getByText(/forgot password/i))
    await user.type(screen.getByLabelText(/email/i), 'user@example.com')
    await user.click(screen.getByRole('button', { name: /send reset code/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/verification code/i), '123456')
    await user.type(screen.getByLabelText(/new password/i), 'newpassword123')
    await user.type(screen.getByLabelText(/confirm new password/i), 'newpassword123')
    await user.click(screen.getByRole('button', { name: /reset password/i }))

    await waitFor(() => {
      expect(screen.getByText(/password reset successful/i)).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    })
  })

  it('shows loading states during form submission', async () => {
    const user = userEvent.setup()
    render(<Login onLogin={mockOnLogin} />)

    await user.type(screen.getByLabelText(/username/i), 'demo')
    await user.type(screen.getByLabelText(/password/i), 'demo123')

    const signInButton = screen.getByRole('button', { name: /sign in/i })
    await user.click(signInButton)

    // Button should show loading state temporarily
    expect(screen.getByText(/signing in/i)).toBeInTheDocument()
  })

  it('can navigate back to login from other views', async () => {
    const user = userEvent.setup()
    render(<Login onLogin={mockOnLogin} />)

    // Go to signup
    await user.click(screen.getByRole('button', { name: /create new account/i }))
    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument()

    // Go back to login
    await user.click(screen.getByText(/back to sign in/i))
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()

    // Go to forgot password
    await user.click(screen.getByText(/forgot password/i))
    expect(screen.getByRole('heading', { name: /forgot password/i })).toBeInTheDocument()

    // Go back to login
    await user.click(screen.getByText(/back to sign in/i))
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  it('clears form errors when switching views', async () => {
    const user = userEvent.setup()
    render(<Login onLogin={mockOnLogin} />)

    // Trigger validation errors in login
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(screen.getByText(/username is required/i)).toBeInTheDocument()

    // Switch to signup
    await user.click(screen.getByRole('button', { name: /create new account/i }))

    // Switch back to login
    await user.click(screen.getByText(/back to sign in/i))

    // Errors should be cleared
    expect(screen.queryByText(/username is required/i)).not.toBeInTheDocument()
  })

  it('auto-dismisses notifications after timeout', async () => {
    vi.useFakeTimers()
    const user = userEvent.setup()
    render(<Login onLogin={mockOnLogin} />)

    // Trigger error
    await user.type(screen.getByLabelText(/username/i), 'invaliduser')
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument()
    })

    // Fast forward 5 seconds
    vi.advanceTimersByTime(5000)

    await waitFor(() => {
      expect(screen.queryByText(/invalid username or password/i)).not.toBeInTheDocument()
    })

    vi.useRealTimers()
  })
})