import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { strategiesAPI } from '../lib/supabase'

export default function Strategies() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [notification, setNotification] = useState(null) // { type: 'success'|'error', message: string }
  const [newRule, setNewRule] = useState({
    name: '',
    reduction_type: 'percentage', // 'percentage' or 'dollar'
    reduction_amount: 5,
    frequency_days: 7
  })

  // Fetch strategies from database
  const { data: rules = [], isLoading, error } = useQuery({
    queryKey: ['strategies'],
    queryFn: strategiesAPI.getStrategies
  })

  // Create strategy mutation
  const createStrategyMutation = useMutation({
    mutationFn: strategiesAPI.createStrategy,
    onSuccess: (newStrategy) => {
      queryClient.invalidateQueries(['strategies'])
      showNotification('success', `Rule "${newStrategy.name}" created successfully!`)
    },
    onError: (error) => {
      showNotification('error', error.message || 'Failed to create strategy')
    }
  })

  // Update strategy mutation
  const updateStrategyMutation = useMutation({
    mutationFn: ({ id, updates }) => strategiesAPI.updateStrategy(id, updates),
    onSuccess: (updatedStrategy) => {
      queryClient.invalidateQueries(['strategies'])
      showNotification('success', `Rule "${updatedStrategy.name}" updated successfully!`)
    },
    onError: (error) => {
      showNotification('error', error.message || 'Failed to update strategy')
    }
  })

  // Delete strategy mutation
  const deleteStrategyMutation = useMutation({
    mutationFn: strategiesAPI.deleteStrategy,
    onSuccess: () => {
      queryClient.invalidateQueries(['strategies'])
      showNotification('success', 'Rule deleted successfully!')
    },
    onError: (error) => {
      showNotification('error', error.message || 'Failed to delete strategy')
    }
  })

  const showNotification = (type, message) => {
    setNotification({ type, message })
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setNotification(null)
    }, 5000)
  }

  const handleCreateRule = () => {
    if (!newRule.name.trim()) {
      showNotification('error', 'Please enter a rule name')
      return
    }

    if (newRule.reduction_amount < 1) {
      showNotification('error', 'Reduction amount must be at least 1')
      return
    }

    if (newRule.frequency_days < 1 || newRule.frequency_days > 365) {
      showNotification('error', 'Frequency must be between 1 and 365 days')
      return
    }

    createStrategyMutation.mutate({
      name: newRule.name,
      reduction_type: newRule.reduction_type,
      reduction_amount: newRule.reduction_amount,
      frequency_days: newRule.frequency_days,
      active: true
    })

    setNewRule({
      name: '',
      reduction_type: 'percentage',
      reduction_amount: 5,
      frequency_days: 7
    })
    setShowModal(false)
  }

  const handleUpdateRule = (id, updates) => {
    updateStrategyMutation.mutate({ id, updates })
    setEditingRule(null)
  }

  const handleDeleteRule = (id) => {
    const rule = rules.find(r => r.id === id)
    if (window.confirm(`Are you sure you want to delete "${rule?.name}"?`)) {
      deleteStrategyMutation.mutate(id)
    }
  }

  const handleToggleActive = (id) => {
    const rule = rules.find(r => r.id === id)
    if (rule) {
      updateStrategyMutation.mutate({
        id,
        updates: { active: !rule.active }
      })
    }
  }

  const resetModal = () => {
    setNewRule({
      name: '',
      reduction_type: 'percentage',
      reduction_amount: 5,
      frequency_days: 7
    })
    setShowModal(false)
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading strategies...</div>
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-red-500">Error loading strategies: {error.message}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Price Reduction Rules</h1>
          <p className="text-gray-600 mt-2 text-sm sm:text-base">Create and manage automated price reduction rules for your listings</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center space-x-2 w-full sm:w-auto"
        >
          <span>➕</span>
          <span>Add New Rule</span>
        </button>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div className={`rounded-lg p-4 flex items-center justify-between ${
          notification.type === 'success'
            ? 'bg-blue-50 border border-blue-200'
            : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-center space-x-3">
            <div className={`flex-shrink-0 ${
              notification.type === 'success' ? 'text-blue-600' : 'text-red-600'
            }`}>
              {notification.type === 'success' ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div>
              <p className={`text-sm font-medium ${
                notification.type === 'success' ? 'text-blue-800' : 'text-red-800'
              }`}>
                {notification.message}
              </p>
            </div>
          </div>
          <button
            onClick={() => setNotification(null)}
            className={`flex-shrink-0 text-sm font-medium ${
              notification.type === 'success'
                ? 'text-blue-600 hover:text-blue-800'
                : 'text-red-600 hover:text-red-800'
            }`}
          >
            ✕
          </button>
        </div>
      )}

      {/* Rules List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Your Rules ({rules.length})</h3>
        </div>

        {rules.length === 0 ? (
          <div className="px-4 sm:px-6 py-8 sm:py-12 text-center">
            <div className="text-gray-400 text-6xl mb-4">📋</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No rules created yet</h3>
            <p className="text-gray-600 mb-4">Create your first price reduction rule to get started</p>
            <button
              onClick={() => setShowModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Create First Rule
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {rules.map((rule) => (
              <div key={rule.id} className="px-4 sm:px-6 py-4 sm:py-6">
                {editingRule === rule.id ? (
                  <EditRuleForm
                    rule={rule}
                    onSave={handleUpdateRule}
                    onCancel={() => setEditingRule(null)}
                    showNotification={showNotification}
                  />
                ) : (
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-3">
                        <h4 className="text-lg font-medium text-gray-900">{rule.name}</h4>
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          rule.active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {rule.active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-6 text-sm">
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-500">Reduction:</span>
                          <div className="font-medium text-blue-600">
                            {rule.reduction_type === 'percentage' ? `${rule.reduction_amount}%` : `$${rule.reduction_amount}`}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-500">Frequency:</span>
                          <div className="font-medium">Every {rule.frequency_days} day{rule.frequency_days !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-500">Created:</span>
                          <div className="font-medium">{new Date(rule.created_at).toLocaleDateString()}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 lg:ml-6">
                      <button
                        onClick={() => handleToggleActive(rule.id)}
                        className={`px-4 py-2 rounded text-sm font-medium w-full sm:w-auto ${
                          rule.active
                            ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                            : 'bg-green-100 text-green-800 hover:bg-green-200'
                        }`}
                      >
                        {rule.active ? 'Pause' : 'Activate'}
                      </button>
                      <button
                        onClick={() => setEditingRule(rule.id)}
                        className="bg-blue-100 text-blue-800 px-4 py-2 rounded text-sm font-medium hover:bg-blue-200 w-full sm:w-auto"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="bg-red-100 text-red-800 px-4 py-2 rounded text-sm font-medium hover:bg-red-200 w-full sm:w-auto"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add New Rule Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Create New Rule</h3>
              <button
                onClick={resetModal}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name</label>
                <input
                  type="text"
                  value={newRule.name}
                  onChange={(e) => setNewRule(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Quick Sale Rule"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reduction Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewRule(prev => ({ ...prev, reduction_type: 'percentage' }))}
                    className={`px-3 py-2 rounded-md border text-sm font-medium ${
                      newRule.reduction_type === 'percentage'
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Percentage (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRule(prev => ({ ...prev, reduction_type: 'dollar' }))}
                    className={`px-3 py-2 rounded-md border text-sm font-medium ${
                      newRule.reduction_type === 'dollar'
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Dollar Amount ($)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reduction Amount ({newRule.reduction_type === 'percentage' ? '%' : '$'})
                </label>
                <input
                  type="number"
                  min="1"
                  max={newRule.reduction_type === 'percentage' ? "50" : "999"}
                  value={newRule.reduction_amount}
                  onChange={(e) => setNewRule(prev => ({ ...prev, reduction_amount: parseInt(e.target.value) || 1 }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Frequency (Days)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={newRule.frequency_days}
                  onChange={(e) => setNewRule(prev => ({ ...prev, frequency_days: parseInt(e.target.value) || 1 }))}
                  placeholder="Enter number of days (e.g., 7)"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Enter any number from 1 to 365 days</p>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={handleCreateRule}
                disabled={!newRule.name.trim()}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Rule
              </button>
              <button
                onClick={resetModal}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Edit Rule Form Component
function EditRuleForm({ rule, onSave, onCancel, showNotification }) {
  const [editData, setEditData] = useState({
    name: rule.name,
    reduction_type: rule.reduction_type,
    reduction_amount: rule.reduction_amount,
    frequency_days: rule.frequency_days
  })

  const handleSave = () => {
    if (!editData.name.trim()) {
      showNotification('error', 'Please enter a rule name')
      return
    }
    if (editData.reduction_amount < 1) {
      showNotification('error', 'Reduction amount must be at least 1')
      return
    }
    if (editData.frequency_days < 1 || editData.frequency_days > 365) {
      showNotification('error', 'Frequency must be between 1 and 365 days')
      return
    }
    onSave(rule.id, editData)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name</label>
          <input
            type="text"
            value={editData.name}
            onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reduction Type</label>
          <select
            value={editData.reduction_type}
            onChange={(e) => setEditData(prev => ({ ...prev, reduction_type: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          >
            <option value="percentage">Percentage (%)</option>
            <option value="dollar">Dollar Amount ($)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reduction Amount ({editData.reduction_type === 'percentage' ? '%' : '$'})
          </label>
          <input
            type="number"
            min="1"
            value={editData.reduction_amount}
            onChange={(e) => setEditData(prev => ({ ...prev, reduction_amount: parseInt(e.target.value) || 1 }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Frequency (Days)</label>
          <input
            type="number"
            min="1"
            max="365"
            value={editData.frequency_days}
            onChange={(e) => setEditData(prev => ({ ...prev, frequency_days: parseInt(e.target.value) || 1 }))}
            placeholder="Enter number of days"
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          />
        </div>
      </div>

      <div className="flex space-x-3">
        <button
          onClick={handleSave}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
        >
          Save Changes
        </button>
        <button
          onClick={onCancel}
          className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}