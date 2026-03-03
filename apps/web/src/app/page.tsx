/**
 * Page racine — redirige vers le dashboard ou la connexion.
 */
import { redirect } from "next/navigation";

export default function HomePage() {
  // TODO : vérifier le cookie de session, rediriger vers /dashboard si connecté
  redirect("/login");
}
