# eBay Price Reducer

Automated eBay listing price reduction tool with market analysis and smart pricing strategies.

## 🚀 Features

- **Automated Price Monitoring** - Set it and forget it price reductions
- **Smart Pricing Strategies** - Fixed percentage, market-based, or time-based reductions
- **Market Analysis** - Compare your prices against recent sold items
- **Real-time Dashboard** - Monitor all your listings in one place
- **Secure & Scalable** - Built with Supabase + Netlify architecture

## 🏗️ Architecture

- **Frontend**: React (Vite) with Tailwind CSS
- **Backend**: Netlify Functions (serverless)
- **Database**: PostgreSQL via Supabase
- **Authentication**: Supabase Auth
- **Deployment**: Netlify with automatic CI/CD
- **APIs**: eBay Trading & Finding APIs

## 📁 Project Structure

```
├── frontend/               # React frontend application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── lib/            # Supabase client & utilities
│   │   └── contexts/       # React contexts (Auth)
│   └── package.json
├── netlify/
│   └── functions/          # Serverless backend functions
├── supabase-schema.sql     # Database schema
├── netlify.toml           # Netlify deployment config
└── DEPLOYMENT.md          # Detailed deployment guide
```

## 🛠️ Quick Start

### Prerequisites

1. [Supabase account](https://supabase.com)
2. [Netlify account](https://netlify.com)
3. [eBay Developer credentials](https://developer.ebay.com)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/ebay-price-reducer.git
   cd ebay-price-reducer
   ```

2. **Set up Supabase**
   - Create a new Supabase project
   - Run the SQL in `supabase-schema.sql`
   - Get your project URL and keys

3. **Configure environment variables**
   ```bash
   # Frontend
   cp frontend/.env.example frontend/.env.local
   # Add your Supabase credentials

   # Functions (for local testing)
   cp .env.netlify.example .env
   # Add your Supabase and eBay credentials
   ```

4. **Install dependencies**
   ```bash
   cd frontend && npm install
   cd ../netlify/functions && npm install
   ```

5. **Start development server**
   ```bash
   cd frontend && npm run dev
   ```

### Deploy to Production

See detailed instructions in [DEPLOYMENT.md](./DEPLOYMENT.md)

## 🔧 Configuration

### eBay API Setup

1. Create an eBay developer account
2. Generate App ID, Dev ID, and Cert ID
3. Create a user token for your eBay account
4. Add credentials to Netlify environment variables

### Pricing Strategies

- **Fixed Percentage**: Reduce by a set percentage every X days
- **Market Based**: Analyze competitor prices and adjust accordingly
- **Time Based**: More aggressive reductions for older listings

## 📊 Features

### Dashboard
- Overview of all listings
- Quick stats and metrics
- Recent activity feed

### Listing Management
- Import listings from eBay
- Configure individual pricing strategies
- Manual price adjustments
- Price history tracking

### Market Analysis
- Compare against recent sold items
- Get pricing suggestions
- Track competitor activity

### Automated Monitoring
- Hourly price checks
- Automatic adjustments based on strategy
- Error tracking and notifications

## 🔒 Security

- Row Level Security (RLS) in Supabase
- Secure API key management
- User data isolation
- Encrypted credential storage

## 📈 Monitoring

- Function execution logs in Netlify
- Database monitoring in Supabase
- Error tracking in sync_errors table
- Scheduled job monitoring

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details

## 🆘 Support

- Check [DEPLOYMENT.md](./DEPLOYMENT.md) for setup issues
- Review function logs in Netlify dashboard
- Monitor database logs in Supabase
- Create GitHub issues for bugs/features

## 🎯 Roadmap

- [ ] Email notifications for price changes
- [ ] Bulk listing operations
- [ ] Advanced analytics dashboard
- [ ] Mobile app
- [ ] Multi-marketplace support

---

Built with ❤️ using modern web technologies