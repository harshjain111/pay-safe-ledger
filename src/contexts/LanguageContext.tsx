import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'en' | 'hi' | 'as';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Dashboard
    'welcome': 'Welcome',
    'my_salary': 'My Salary',
    'my_advance': 'Advance Pending',
    'tap_to_view': 'Tap to view',
    'hidden': 'Hidden',
    'no_pending': 'No pending advance',
    
    // Action buttons
    'request_advance': 'Request Advance',
    'request_expense': 'Request Expense',
    
    // Recent requests
    'recent_requests': 'Recent Requests',
    'no_requests': 'No requests yet',
    'pending': 'Pending',
    'approved': 'Approved',
    'rejected': 'Rejected',
    'paid': 'Paid',
    'reimbursed': 'Reimbursed',
    
    // Forms
    'amount': 'Amount',
    'enter_amount': 'Enter amount',
    'note': 'Note (optional)',
    'add_note': 'Add a note...',
    'category': 'Category',
    'select_category': 'Select category',
    'photo': 'Photo',
    'take_photo': 'Take Photo',
    'upload_photo': 'Upload',
    'upload_receipt': 'Upload picture of receipt/proof',
    'submit': 'Submit',
    'cancel': 'Cancel',
    'submitting': 'Submitting...',
    
    // Categories
    'travel': 'Travel',
    'food': 'Food',
    'logistics': 'Logistics',
    'equipment': 'Equipment',
    'office_supplies': 'Office',
    'communication': 'Phone',
    'other': 'Other',
    
    // Success messages
    'advance_success': 'Advance request sent!',
    'expense_success': 'Expense submitted!',
    'request_sent': 'Your request has been sent for approval',
    
    // Errors
    'enter_valid_amount': 'Please enter a valid amount',
    'error_occurred': 'Something went wrong. Try again.',
    'description_required': 'Description is required',
    'category_name_required': 'Please enter category name',
    
    // Description & Category
    'description': 'Description',
    'enter_description': 'Describe the expense...',
    'category_name': 'Category Name',
    'enter_category_name': 'Enter category name...',
    
    // Language
    'language': 'Language',
    'english': 'English',
    'hindi': 'हिंदी',
    'assamese': 'অসমীয়া',
    
    // Time
    'today': 'Today',
    'yesterday': 'Yesterday',
    'days_ago': 'days ago',
  },
  hi: {
    // Dashboard
    'welcome': 'नमस्ते',
    'my_salary': 'मेरी सैलरी',
    'my_advance': 'बाकी एडवांस',
    'tap_to_view': 'देखने के लिए टैप करें',
    'hidden': 'छुपा हुआ',
    'no_pending': 'कोई बाकी एडवांस नहीं',
    
    // Action buttons
    'request_advance': 'एडवांस मांगें',
    'request_expense': 'खर्चा भरें',
    
    // Recent requests
    'recent_requests': 'हाल की रिक्वेस्ट',
    'no_requests': 'अभी कोई रिक्वेस्ट नहीं',
    'pending': 'पेंडिंग',
    'approved': 'अप्रूव',
    'rejected': 'रिजेक्ट',
    'paid': 'पेमेंट हो गया',
    'reimbursed': 'पैसे मिल गए',
    
    // Forms
    'amount': 'रकम',
    'enter_amount': 'रकम डालें',
    'note': 'नोट (ऑप्शनल)',
    'add_note': 'कुछ लिखें...',
    'category': 'कैटेगरी',
    'select_category': 'कैटेगरी चुनें',
    'photo': 'फोटो',
    'take_photo': 'फोटो खींचें',
    'upload_photo': 'अपलोड',
    'upload_receipt': 'रसीद/प्रूफ की फोटो अपलोड करें',
    'submit': 'भेजें',
    'cancel': 'रद्द करें',
    'submitting': 'भेज रहे हैं...',
    
    // Categories
    'travel': 'ट्रैवल',
    'food': 'खाना',
    'logistics': 'लॉजिस्टिक्स',
    'equipment': 'सामान',
    'office_supplies': 'ऑफिस',
    'communication': 'फोन',
    'other': 'अन्य',
    
    // Success messages
    'advance_success': 'एडवांस रिक्वेस्ट भेज दी!',
    'expense_success': 'खर्चा भेज दिया!',
    'request_sent': 'आपकी रिक्वेस्ट अप्रूवल के लिए भेज दी गई',
    
    // Errors
    'enter_valid_amount': 'सही रकम डालें',
    'error_occurred': 'कुछ गड़बड़ हो गई। फिर से कोशिश करें।',
    'description_required': 'विवरण जरूरी है',
    'category_name_required': 'कैटेगरी का नाम डालें',
    
    // Description & Category
    'description': 'विवरण',
    'enter_description': 'खर्च का विवरण दें...',
    'category_name': 'कैटेगरी का नाम',
    'enter_category_name': 'कैटेगरी का नाम लिखें...',
    
    // Language
    'language': 'भाषा',
    'english': 'English',
    'hindi': 'हिंदी',
    'assamese': 'অসমীয়া',
    
    // Time
    'today': 'आज',
    'yesterday': 'कल',
    'days_ago': 'दिन पहले',
  },
  as: {
    // Dashboard
    'welcome': 'স্বাগতম',
    'my_salary': 'মোৰ দৰমহা',
    'my_advance': 'বাকী এডভান্স',
    'tap_to_view': 'চাবলৈ টেপ কৰক',
    'hidden': 'লুকুৱা',
    'no_pending': 'কোনো বাকী এডভান্স নাই',
    
    // Action buttons
    'request_advance': 'এডভান্স বিচাৰক',
    'request_expense': 'খৰচ দাখিল কৰক',
    
    // Recent requests
    'recent_requests': 'শেহতীয়া অনুৰোধ',
    'no_requests': 'এতিয়ালৈকে কোনো অনুৰোধ নাই',
    'pending': 'অপেক্ষাৰত',
    'approved': 'অনুমোদিত',
    'rejected': 'প্ৰত্যাখ্যান',
    'paid': 'পৰিশোধ হ\'ল',
    'reimbursed': 'টকা পোৱা গ\'ল',
    
    // Forms
    'amount': 'পৰিমাণ',
    'enter_amount': 'পৰিমাণ দিয়ক',
    'note': 'টোকা (ঐচ্ছিক)',
    'add_note': 'কিবা লিখক...',
    'category': 'শ্ৰেণী',
    'select_category': 'শ্ৰেণী বাছক',
    'photo': 'ফটো',
    'take_photo': 'ফটো তোলক',
    'upload_photo': 'আপলোড',
    'upload_receipt': 'ৰছিদ/প্ৰমাণৰ ফটো আপলোড কৰক',
    'submit': 'দাখিল কৰক',
    'cancel': 'বাতিল কৰক',
    'submitting': 'দাখিল কৰি আছে...',
    
    // Categories
    'travel': 'ভ্ৰমণ',
    'food': 'খাদ্য',
    'logistics': 'লজিষ্টিকছ',
    'equipment': 'সঁজুলি',
    'office_supplies': 'অফিচ',
    'communication': 'ফোন',
    'other': 'অন্যান্য',
    
    // Success messages
    'advance_success': 'এডভান্স অনুৰোধ পঠিওৱা হ\'ল!',
    'expense_success': 'খৰচ দাখিল কৰা হ\'ল!',
    'request_sent': 'আপোনাৰ অনুৰোধ অনুমোদনৰ বাবে পঠিওৱা হৈছে',
    
    // Errors
    'enter_valid_amount': 'সঠিক পৰিমাণ দিয়ক',
    'error_occurred': 'কিবা সমস্যা হ\'ল। আকৌ চেষ্টা কৰক।',
    'description_required': 'বিৱৰণ আৱশ্যক',
    'category_name_required': 'শ্ৰেণীৰ নাম দিয়ক',
    
    // Description & Category
    'description': 'বিৱৰণ',
    'enter_description': 'খৰচৰ বিৱৰণ দিয়ক...',
    'category_name': 'শ্ৰেণীৰ নাম',
    'enter_category_name': 'শ্ৰেণীৰ নাম লিখক...',
    
    // Language
    'language': 'ভাষা',
    'english': 'English',
    'hindi': 'हिंदी',
    'assamese': 'অসমীয়া',
    
    // Time
    'today': 'আজি',
    'yesterday': 'কালি',
    'days_ago': 'দিন আগতে',
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    const saved = localStorage.getItem('app_language') as Language;
    if (saved && ['en', 'hi', 'as'].includes(saved)) {
      setLanguageState(saved);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('app_language', lang);
  };

  const t = (key: string): string => {
    return translations[language][key] || translations['en'][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
