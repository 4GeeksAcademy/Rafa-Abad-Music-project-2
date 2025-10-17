// src/front/hooks/useGlobalReducer.jsx
import { useContext, useReducer, createContext, useEffect } from "react";
import storeReducer, { initialStore } from "../store";

const StoreContext = createContext();

export function StoreProvider({ children }) {
    const [store, dispatch] = useReducer(storeReducer, initialStore());

    useEffect(() => {
        // try to load user from localStorage on startup
        const token = localStorage.getItem("token");
        const cachedUser = localStorage.getItem("user");
        if (cachedUser) {
            try {
                const userObj = JSON.parse(cachedUser);
                dispatch({ type: "set_user", payload: userObj });
                return;
            } catch {
                console.warn("Invalid user in localStorage, clearing it.");
                localStorage.removeItem("user");
            }
        }

        // fallback: fetch user from /api/auth/me if we have a token but no cached user
        if (token) {
            const backend = import.meta.env.VITE_BACKEND_URL;
            fetch(`${backend}/api/auth/me`, {
                headers: { Authorization: `Bearer ${token}` },
            })
                .then((r) => (r.ok ? r.json() : null))
                .then((data) => {
                    if (data) {
                        localStorage.setItem("user", JSON.stringify(data));
                        dispatch({ type: "set_user", payload: data });
                    }
                })
                .catch((err) => console.error("Auth rehydrate failed:", err));
        }
    }, []);

    return (
        <StoreContext.Provider value={{ store, dispatch }}>
            {children}
        </StoreContext.Provider>
    );
}

export default function useGlobalReducer() {
    const { dispatch, store } = useContext(StoreContext);
    return { dispatch, store };
}
