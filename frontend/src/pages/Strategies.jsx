import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { strategiesAPI } from '../lib/supabase'
import { Plus, FileText, Check, X } from 'lucide-react'

export default function Strategies() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [notification, setNotification] = useState(null)
  const [newRule, setNewRule] = useState({
    name: '',
    reduction_type: 'percentage',
    reduction_amount: 5,
    frequency_days: 7
  })

  const { data: rules = [], isLoading, error } = useQuery({
    queryKey: ['strategies'],
    queryFn: strategiesAPI.getStrategies
  })

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
    setTimeout(() => setNotification(null), 5000)
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

    // Map frontend field names to database column names
    createStrategyMutation.mutate({
      name: newRule.name,
      strategy_type: newRule.reduction_type,  // DB uses strategy_type
      reduction_percentage: newRule.reduction_type === 'percentage' ? newRule.reduction_amount : 0,
      reduction_amount: newRule.reduction_type === 'dollar' ? newRule.reduction_amount : 0,
      interval_days: newRule.frequency_days,  // DB uses interval_days
      is_active: true
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
    // Map frontend field names to database column names
    const dbUpdates = {
      name: updates.name,
      strategy_type: updates.reduction_type,  // DB uses strategy_type
      reduction_percentage: updates.reduction_type === 'percentage' ? updates.reduction_amount : 0,
      reduction_amount: updates.reduction_type === 'dollar' ? updates.reduction_amount : 0,
      interval_days: updates.frequency_days  // DB uses interval_days
    }
    updateStrategyMutation.mutate({ id, updates: dbUpdates })
    setEditingRule(null)
  }

  const handleDeleteRule = (id) => {
    const rule = rules.find(r => r.id === id)
    if (window.confirm(`Are you sure you want to delete "${rule?.name}"?`)) {
      deleteStrategyMutation.mutate(id)
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-text-secondary">Loading strategies...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-error">Error loading strategies: {error.message}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-text-primary">Price Reduction Rules</h1>
          <p className="text-text-secondary mt-2 text-sm sm:text-base">Create and manage automated price reduction rules for your listings</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-accent text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg hover:bg-accent-hover font-medium flex items-center justify-center space-x-2 w-full sm:w-auto transition-colors"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          <span>Add New Rule</span>
        </button>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div className={`rounded-lg p-4 flex items-center justify-between ${
          notification.type === 'success'
            ? 'bg-success/10 border border-success/30'
            : 'bg-error/10 border border-error/30'
        }`}>
          <div className="flex items-center space-x-3">
            <div className={notification.type === 'success' ? 'text-success' : 'text-error'}>
              {notification.type === 'success' ? <Check className="h-5 w-5" strokeWidth={2} /> : <X className="h-5 w-5" strokeWidth={2} />}
            </div>
            <p className={`text-sm font-medium ${
              notification.type === 'success' ? 'text-success' : 'text-error'
            }`}>
              {notification.message}
            </p>
          </div>
          <button
            onClick={() => setNotification(null)}
            className={`text-sm font-medium ${
              notification.type === 'success' ? 'text-success hover:text-success' : 'text-error hover:text-error'
            }`}
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Rules List */}
      <div className="bg-dark-surface rounded-lg border border-dark-border overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-dark-border">
          <h3 className="text-lg font-medium text-text-primary">Your Rules ({rules.length})</h3>
        </div>

        {rules.length === 0 ? (
          <div className="px-4 sm:px-6 py-8 sm:py-12 text-center">
            <FileText className="h-16 w-16 text-text-tertiary mx-auto mb-4" strokeWidth={1} />
            <h3 className="text-lg font-medium text-text-primary mb-2">No rules created yet</h3>
            <p className="text-text-secondary mb-4">Create your first price reduction rule to get started</p>
            <button
              onClick={() => setShowModal(true)}
              className="bg-accent text-white px-4 py-2 rounded-lg hover:bg-accent-hover transition-colors"
            >
              Create First Rule
            </button>
          </div>
        ) : (
          <div className="divide-y divide-dark-border">
            {rules.map((rule) => (
              <div key={rule.id} className="px-4 sm:px-6 py-4 sm:py-6 hover:bg-dark-hover transition-colors">
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
                        <h4 className="text-lg font-medium text-text-primary">{rule.name}</h4>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-6 text-sm">
                        <div className="flex items-center space-x-2">
                          <span className="text-text-tertiary">Reduction:</span>
                          <div className="font-medium text-accent">
                            {(rule.strategy_type || rule.reduction_type) === 'percentage' 
                              ? `${rule.reduction_percentage || rule.reduction_amount}%` 
                              : `$${rule.reduction_amount}`}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-text-tertiary">Frequency:</span>
                          <div className="font-medium text-text-primary">Every {rule.interval_days || rule.frequency_days || '?'} day{(rule.interval_days || rule.frequency_days) !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-text-tertiary">Created:</span>
                          <div className="font-medium text-text-primary">{new Date(rule.created_at).toLocaleDateString()}</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 lg:ml-6">
                      <button
                        onClick={() => setEditingRule(rule.id)}
                        className="bg-accent/10 text-accent border border-accent/30 px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/20 w-full sm:w-auto transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="bg-error/10 text-error border border-error/30 px-4 py-2 rounded-lg text-sm font-medium hover:bg-error/20 w-full sm:w-auto transition-colors"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface border border-dark-border rounded-xl p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-text-primary">Create New Rule</h3>
              <button
                onClick={resetModal}
                className="text-text-tertiary hover:text-text-primary transition-colors p-1 rounded-lg hover:bg-dark-hover"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Rule Name</label>
                <input
                  type="text"
                  value={newRule.name}
                  onChange={(e) => setNewRule(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Quick Sale Rule"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2.5 text-text-primary placeholder-text-tertiary focus:ring-2 focus:ring-accent focus:border-transparent transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Reduction Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewRule(prev => ({ ...prev, reduction_type: 'percentage' }))}
                    className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                      newRule.reduction_type === 'percentage'
                        ? 'bg-accent/10 border-accent text-accent'
                        : 'bg-dark-bg border-dark-border text-text-secondary hover:bg-dark-hover'
                    }`}
                  >
                    Percentage (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRule(prev => ({ ...prev, reduction_type: 'dollar' }))}
                    className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                      newRule.reduction_type === 'dollar'
                        ? 'bg-accent/10 border-accent text-accent'
                        : 'bg-dark-bg border-dark-border text-text-secondary hover:bg-dark-hover'
                    }`}
                  >
                    Dollar Amount ($)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Reduction Amount ({newRule.reduction_type === 'percentage' ? '%' : '$'})
                </label>
                <input
                  type="number"
                  min="1"
                  max={newRule.reduction_type === 'percentage' ? "50" : "999"}
                  value={newRule.reduction_amount}
                  onChange={(e) => setNewRule(prev => ({ ...prev, reduction_amount: parseInt(e.target.value) || 1 }))}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2.5 text-text-primary focus:ring-2 focus:ring-accent focus:border-transparent transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Frequency (Days)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={newRule.frequency_days}
                  onChange={(e) => setNewRule(prev => ({ ...prev, frequency_days: parseInt(e.target.value) || 1 }))}
                  placeholder="Enter number of days (e.g., 7)"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2.5 text-text-primary placeholder-text-tertiary focus:ring-2 focus:ring-accent focus:border-transparent transition-colors"
                />
                <p className="text-xs text-text-tertiary mt-1">Enter any number from 1 to 365 days</p>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={handleCreateRule}
                disabled={!newRule.name.trim()}
                className="flex-1 bg-accent text-white px-4 py-2.5 rounded-lg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                Create Rule
              </button>
              <button
                onClick={resetModal}
                className="px-4 py-2.5 border border-dark-border text-text-secondary rounded-lg hover:bg-dark-hover transition-colors"
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

function EditRuleForm({ rule, onSave, onCancel, showNotification }) {
  const [editData, setEditData] = useState({
    name: rule.name,
    reduction_type: rule.reduction_type || 'percentage',
    reduction_amount: rule.reduction_amount || 0,
    frequency_days: rule.frequency_days || 7
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
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Rule Name</label>
          <input
            type="text"
            value={editData.name}
            onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2.5 text-text-primary focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Reduction Type</label>
          <select
            value={editData.reduction_type}
            onChange={(e) => setEditData(prev => ({ ...prev, reduction_type: e.target.value }))}
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2.5 text-text-primary focus:ring-2 focus:ring-accent focus:border-transparent"
          >
            <option value="percentage">Percentage (%)</option>
            <option value="dollar">Dollar Amount ($)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">
            Reduction Amount ({editData.reduction_type === 'percentage' ? '%' : '$'})
          </label>
          <input
            type="number"
            min="1"
            value={editData.reduction_amount}
            onChange={(e) => setEditData(prev => ({ ...prev, reduction_amount: parseInt(e.target.value) || 1 }))}
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2.5 text-text-primary focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1.5">Frequency (Days)</label>
          <input
            type="number"
            min="1"
            max="365"
            value={editData.frequency_days}
            onChange={(e) => setEditData(prev => ({ ...prev, frequency_days: parseInt(e.target.value) || 1 }))}
            placeholder="Enter number of days"
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2.5 text-text-primary placeholder-text-tertiary focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>
      </div>

      <div className="flex space-x-3">
        <button
          onClick={handleSave}
          className="bg-success/10 text-success border border-success/30 px-4 py-2 rounded-lg hover:bg-success/20 transition-colors font-medium"
        >
          Save Changes
        </button>
        <button
          onClick={onCancel}
          className="bg-dark-hover text-text-secondary px-4 py-2 rounded-lg hover:bg-dark-border transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
