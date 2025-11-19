import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, authAPI } from '../lib/supabase'

export default function Login({ onLogin }) {
  const [currentView, setCurrentView] = useState('login') // 'login', 'signup', 'forgot', 'reset'
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    name: ''
  })
  const [forgotData, setForgotData] = useState({
    email: '',
    username: ''
  })
  const [resetData, setResetData] = useState({
    code: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [notification, setNotification] = useState(null)

  const showNotification = (type, message) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 5000)
  }

  const handleInputChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  const validateLogin = () => {
    const newErrors = {}

    if (!formData.username.trim()) {
      newErrors.username = 'Username is required'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateSignup = () => {
    const newErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Full name is required'
    }

    if (!formData.username.trim()) {
      newErrors.username = 'Username is required'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateForgot = () => {
    const newErrors = {}

    if (!forgotData.email.trim() && !forgotData.username.trim()) {
      newErrors.general = 'Please provide either email or username'
    }

    if (forgotData.email && !/\S+@\S+\.\S+/.test(forgotData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateReset = () => {
    const newErrors = {}

    if (!resetData.code.trim()) {
      newErrors.code = 'Reset code is required'
    }

    if (!resetData.newPassword) {
      newErrors.newPassword = 'New password is required'
    } else if (resetData.newPassword.length < 6) {
      newErrors.newPassword = 'Password must be at least 6 characters'
    }

    if (resetData.newPassword !== resetData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!validateLogin()) return

    setIsLoading(true)
    setErrors({})

    try {
      // Use real authAPI for login
      const result = await authAPI.signIn(formData.email || formData.username, formData.password)

      if (result.error) {
        setErrors({ general: result.error.message })
      } else {
        const userData = {
          username: result.data.user.email,
          name: result.data.user.user_metadata?.name || result.data.user.email,
          email: result.data.user.email,
          id: result.data.user.id
        }
        showNotification('success', 'Login successful! Redirecting...')
        setTimeout(() => onLogin(userData), 1000)
      }
    } catch (err) {
      setErrors({ general: err.message || 'Login failed. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    if (!validateSignup()) return

    setIsLoading(true)
    setErrors({})

    try {
      // Use existing authAPI for signup
      const result = await authAPI.signUp(formData.email, formData.password, {
        name: formData.name,
        username: formData.username
      })

      if (result.error) {
        setErrors({ general: result.error.message })
      } else {
        showNotification('success', 'Account created successfully! Please check your email to verify your account.')
        setCurrentView('login')
      }
    } catch (err) {
      setErrors({ general: err.message || 'An error occurred during signup' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotSubmit = async (e) => {
    e.preventDefault()
    if (!validateForgot()) return

    setIsLoading(true)
    setErrors({})

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500))

      if (forgotData.email) {
        await authAPI.resetPassword(forgotData.email)
      }

      showNotification('success', 'Reset code sent! Check your email.')
      setCurrentView('reset')
    } catch (error) {
      setErrors({ general: 'Failed to send reset code. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetSubmit = async (e) => {
    e.preventDefault()
    if (!validateReset()) return

    setIsLoading(true)
    setErrors({})

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500))

      showNotification('success', 'Password reset successful! You can now login.')
      setCurrentView('login')
      setResetData({ code: '', newPassword: '', confirmPassword: '' })
    } catch (error) {
      setErrors({ general: 'Password reset failed. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDemoLogin = () => {
    const userData = {
      username: 'demo',
      name: 'Demo User',
      email: 'demo@example.com'
    }
    showNotification('success', 'Demo login successful! Redirecting...')
    setTimeout(() => onLogin(userData), 1000)
  }

  const renderLoginForm = () => (
    <form onSubmit={handleLogin} className="space-y-6">
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          value={formData.username}
          onChange={handleInputChange}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.username ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="Enter your username"
        />
        {errors.username && <p className="text-red-500 text-sm mt-1">{errors.username}</p>}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          value={formData.password}
          onChange={handleInputChange}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.password ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="Enter your password"
        />
        {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
      </div>

      {errors.general && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-red-800 text-sm">{errors.general}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <input
            id="remember-me"
            name="remember-me"
            type="checkbox"
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
            Remember me
          </label>
        </div>

        <div className="text-sm">
          <button
            type="button"
            onClick={() => setCurrentView('forgot')}
            className="font-medium text-blue-600 hover:text-blue-500"
          >
            Forgot username or password?
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Signing In...' : 'Sign In'}
      </button>

      <div className="text-center">
        <span className="text-sm text-gray-600">Don't have an account? </span>
        <button
          type="button"
          onClick={() => setCurrentView('signup')}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          Sign up
        </button>
      </div>
    </form>
  )

  const renderSignupForm = () => (
    <form onSubmit={handleSignup} className="space-y-6">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Full Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          value={formData.name}
          onChange={handleInputChange}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.name ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="Enter your full name"
        />
        {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
      </div>

      <div>
        <label htmlFor="signup-username" className="block text-sm font-medium text-gray-700 mb-1">
          Username
        </label>
        <input
          id="signup-username"
          name="username"
          type="text"
          value={formData.username}
          onChange={handleInputChange}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.username ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="Choose a username"
        />
        {errors.username && <p className="text-red-500 text-sm mt-1">{errors.username}</p>}
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email Address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleInputChange}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.email ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="Enter your email address"
        />
        {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
      </div>

      <div>
        <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          value={formData.password}
          onChange={handleInputChange}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.password ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="Create a password"
        />
        {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          value={formData.confirmPassword}
          onChange={handleInputChange}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.confirmPassword ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="Confirm your password"
        />
        {errors.confirmPassword && <p className="text-red-500 text-sm mt-1">{errors.confirmPassword}</p>}
      </div>

      {errors.general && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-red-800 text-sm">{errors.general}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Creating Account...' : 'Create Account'}
      </button>

      <div className="text-center">
        <span className="text-sm text-gray-600">Already have an account? </span>
        <button
          type="button"
          onClick={() => setCurrentView('login')}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          Sign in
        </button>
      </div>
    </form>
  )

  const renderForgotForm = () => (
    <form onSubmit={handleForgotSubmit} className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-medium text-gray-900">Reset Your Credentials</h3>
        <p className="text-sm text-gray-600 mt-1">
          Enter your email or username and we'll send you a reset code
        </p>
      </div>

      <div>
        <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700 mb-1">
          Email Address
        </label>
        <input
          id="forgot-email"
          type="email"
          value={forgotData.email}
          onChange={(e) => setForgotData(prev => ({ ...prev, email: e.target.value }))}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.email ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="Enter your email address"
        />
        {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
      </div>

      <div className="text-center text-sm text-gray-500">
        — OR —
      </div>

      <div>
        <label htmlFor="forgot-username" className="block text-sm font-medium text-gray-700 mb-1">
          Username
        </label>
        <input
          id="forgot-username"
          type="text"
          value={forgotData.username}
          onChange={(e) => setForgotData(prev => ({ ...prev, username: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter your username"
        />
      </div>

      {errors.general && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-red-800 text-sm">{errors.general}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Sending Reset Code...' : 'Send Reset Code'}
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={() => setCurrentView('login')}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          Back to Login
        </button>
      </div>
    </form>
  )

  const renderResetForm = () => (
    <form onSubmit={handleResetSubmit} className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-medium text-gray-900">Reset Your Password</h3>
        <p className="text-sm text-gray-600 mt-1">
          Enter the reset code sent to your email and create a new password
        </p>
      </div>

      <div>
        <label htmlFor="reset-code" className="block text-sm font-medium text-gray-700 mb-1">
          Reset Code
        </label>
        <input
          id="reset-code"
          type="text"
          value={resetData.code}
          onChange={(e) => setResetData(prev => ({ ...prev, code: e.target.value }))}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.code ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="Enter reset code"
        />
        {errors.code && <p className="text-red-500 text-sm mt-1">{errors.code}</p>}
      </div>

      <div>
        <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">
          New Password
        </label>
        <input
          id="new-password"
          type="password"
          value={resetData.newPassword}
          onChange={(e) => setResetData(prev => ({ ...prev, newPassword: e.target.value }))}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.newPassword ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="Enter new password"
        />
        {errors.newPassword && <p className="text-red-500 text-sm mt-1">{errors.newPassword}</p>}
      </div>

      <div>
        <label htmlFor="confirm-new-password" className="block text-sm font-medium text-gray-700 mb-1">
          Confirm Password
        </label>
        <input
          id="confirm-new-password"
          type="password"
          value={resetData.confirmPassword}
          onChange={(e) => setResetData(prev => ({ ...prev, confirmPassword: e.target.value }))}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.confirmPassword ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="Confirm new password"
        />
        {errors.confirmPassword && <p className="text-red-500 text-sm mt-1">{errors.confirmPassword}</p>}
      </div>

      {errors.general && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-red-800 text-sm">{errors.general}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Resetting Password...' : 'Reset Password'}
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={() => setCurrentView('forgot')}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          Back to Reset
        </button>
      </div>
    </form>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">
            📈 eBay Price Reducer
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {currentView === 'login' && 'Sign in to your account'}
            {currentView === 'signup' && 'Create your account'}
            {currentView === 'forgot' && 'Reset your credentials'}
            {currentView === 'reset' && 'Create new password'}
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {/* Notification Banner */}
          {notification && (
            <div className={`rounded-md p-3 mb-6 ${
              notification.type === 'success'
                ? 'bg-blue-50 border border-blue-200'
                : 'bg-red-50 border border-red-200'
            }`}>
              <div className={`text-sm ${
                notification.type === 'success' ? 'text-blue-800' : 'text-red-800'
              }`}>
                {notification.message}
              </div>
            </div>
          )}

          {currentView === 'login' && renderLoginForm()}
          {currentView === 'signup' && renderSignupForm()}
          {currentView === 'forgot' && renderForgotForm()}
          {currentView === 'reset' && renderResetForm()}

          {/* Features List */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              eBay Price Reducer Features:
            </h3>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• Automated price reduction strategies</li>
              <li>• Real-time market analysis</li>
              <li>• Custom minimum price protection</li>
              <li>• Multiple pricing algorithms</li>
              <li>• Detailed price history tracking</li>
              <li>• Bulk listing management</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}