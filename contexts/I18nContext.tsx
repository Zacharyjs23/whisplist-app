/* eslint-disable import/no-named-as-default-member */
import React, { createContext, useContext, useEffect, useState } from 'react';
import i18n from 'i18next';
import { initReactI18next, useTranslation as useI18NextTranslation } from 'react-i18next';
import * as Localization from 'expo-localization';
import en from '../i18n/en.json';
import es from '../i18n/es.json';

const resources = {
  en: { translation: en },
  es: { translation: es },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

interface I18nContextType {
  language: string;
  setLanguage: (lng: string) => void;
}

const I18nContext = createContext<I18nContextType>({
  language: 'en',
  setLanguage: () => {},
});

export const I18nProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [language, setLanguageState] = useState(i18n.language);

  useEffect(() => {
    const locale = Localization.getLocales()[0]?.languageCode || 'en';
    i18n.changeLanguage(locale);
    setLanguageState(locale);
  }, []);

  const setLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    setLanguageState(lng);
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);
export const useTranslation = () => useI18NextTranslation();
export default i18n;
