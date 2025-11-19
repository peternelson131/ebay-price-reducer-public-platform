const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    type: String,
    required: true,
    trim: true
  },

  // eBay credentials
  ebayCredentials: {
    userToken: String,
    userId: String,
    expiresAt: Date,
    isValid: {
      type: Boolean,
      default: false
    }
  },

  // User preferences
  preferences: {
    defaultReductionStrategy: {
      type: String,
      enum: ['fixed_percentage', 'market_based', 'time_based'],
      default: 'fixed_percentage'
    },
    defaultReductionPercentage: {
      type: Number,
      default: 5,
      min: 1,
      max: 50
    },
    defaultReductionInterval: {
      type: Number,
      default: 7,
      min: 1,
      max: 30
    },
    emailNotifications: {
      type: Boolean,
      default: true
    },
    priceReductionAlerts: {
      type: Boolean,
      default: true
    }
  },

  // Subscription info
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'basic', 'premium'],
      default: 'free'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    expiresAt: Date,
    listingLimit: {
      type: Number,
      default: 10 // Free plan limit
    }
  },

  // Account status
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  loginCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for performance
userSchema.index({ email: 1 });
userSchema.index({ 'ebayCredentials.userId': 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash password if it's new or modified
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to check if eBay credentials are valid
userSchema.methods.hasValidEbayCredentials = function() {
  return this.ebayCredentials.isValid &&
         this.ebayCredentials.userToken &&
         this.ebayCredentials.expiresAt > new Date();
};

// Method to get user's current listing count
userSchema.methods.getCurrentListingCount = async function() {
  const Listing = mongoose.model('Listing');
  return Listing.countDocuments({
    userId: this._id,
    listingStatus: 'Active'
  });
};

// Method to check if user can add more listings
userSchema.methods.canAddListing = async function() {
  const currentCount = await this.getCurrentListingCount();
  return currentCount < this.subscription.listingLimit;
};

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return this.name;
});

// Transform output
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  return userObject;
};

module.exports = mongoose.model('User', userSchema);