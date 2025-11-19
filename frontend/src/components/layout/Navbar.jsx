import { Bars3Icon } from '@heroicons/react/24/outline'

export default function Navbar({ onMenuClick }) {
  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <button
              type="button"
              className="md:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-ebay-blue"
              onClick={onMenuClick}
            >
              <Bars3Icon className="h-6 w-6" />
            </button>

            <div className="flex-shrink-0 flex items-center ml-4 md:ml-0">
              <h1 className="text-2xl font-bold text-ebay-blue">
                eBay Price Reducer
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="h-2 w-2 bg-green-400 rounded-full"></div>
              <span className="text-sm text-gray-600">Connected</span>
            </div>

            <div className="hidden sm:block">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-ebay-blue rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">DU</span>
                </div>
                <span className="text-sm text-gray-700">Demo User</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}