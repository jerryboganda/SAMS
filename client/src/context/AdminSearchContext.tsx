import React, { createContext, useContext, useState, useEffect } from "react";
import { useLocation } from "react-router-dom";

interface AdminSearchContextType {
  globalSearch: string;
  setGlobalSearch: (term: string) => void;
  clearGlobalSearch: () => void;
}

const AdminSearchContext = createContext<AdminSearchContextType>({
  globalSearch: "",
  setGlobalSearch: () => {},
  clearGlobalSearch: () => {},
});

export const AdminSearchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [globalSearch, setGlobalSearch] = useState("");
  const location = useLocation();

  // Optionally reset or keep search across navigation (keeping search or clearing depending on page switch)
  // Let's keep globalSearch active so admins can switch views while keeping their filter!

  const clearGlobalSearch = () => setGlobalSearch("");

  return (
    <AdminSearchContext.Provider value={{ globalSearch, setGlobalSearch, clearGlobalSearch }}>
      {children}
    </AdminSearchContext.Provider>
  );
};

export const useAdminSearch = () => useContext(AdminSearchContext);
