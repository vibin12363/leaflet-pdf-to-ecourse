import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { auth, googleProvider, githubProvider } from '../lib/firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false) }), [])

  async function loginWith(provider) {
    try {
      await signInWithPopup(auth, provider)
    } catch (e) {
      if (e.code === 'auth/account-exists-with-different-credential') {
        throw new Error('This email is already registered with a different sign-in method. Use the provider you signed up with.')
      }
      if (e.code !== 'auth/popup-closed-by-user') {
        throw new Error('Sign-in failed. Please try again.')
      }
    }
  }

  const loginWithGoogle = () => loginWith(googleProvider)
  const loginWithGithub = () => loginWith(githubProvider)
  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, loginWithGithub, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
