// ================================
//  API CONFIG
// ================================

export const API_CONFIG = {
  SUPABASE: {
    URL:      'https://lblgfajadwmlxdlbmrzm.supabase.co',
    ANON_KEY: 'sb_publishable_jYs37uOipMm3iZyy20KViQ_0Q8Nmtm2',
    TABLES: {
      PRODUCTS:           'products',
      CATEGORIES:         'categories',
      BRANCHES:           'branches',
      BRANCH_PRODUCTS:    'branch_products',
      ORDERS:             'orders',
      ORDER_ITEMS:        'order_items',
      AUTH_SESSIONS:      'auth_sessions',
      CLIENTS:            'clients',
      STAFF_USERS:        'staff_users',
    },
  },

  TELEGRAM: {
    BOT_USERNAME: '@nodetree_bot',
    BOT_TOKEN:    '8710399027:AAF-m99Ksqg61HmRanMDz_MGCBZM2RqXwzk',
  },

  IMGBB: {
    API_KEY:  '00874767068958e2bdb1574cd77ed26c',
    BASE_URL: 'https://api.imgbb.com/1/upload',
  },
};
