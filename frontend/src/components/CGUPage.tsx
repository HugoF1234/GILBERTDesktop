/**
 * CGUPage - Page des Conditions Générales d'Utilisation
 */

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { useNavigate } from 'react-router-dom';
import sounds from '../utils/soundDesign';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100, damping: 12 } },
};

const CGUPage: React.FC = () => {
  const navigate = useNavigate();

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-4xl mx-auto px-4 sm:px-6 py-8"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="mb-6">
          <Button
            variant="ghost"
            onClick={() => {
              sounds.click();
              navigate('/settings');
            }}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour aux paramètres
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Conditions Générales d'Utilisation</h1>
          </div>
        </motion.div>

        {/* Content */}
        <motion.div variants={itemVariants}>
          <Card className="shadow-lg">
            <CardContent className="pt-6 prose prose-slate max-w-none">
              <div className="space-y-6 text-gray-700">
                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Objet — Champ d'application</h2>
                  <p>
                    Les présentes Conditions Générales d'Utilisation et de Vente (ci-après les « CGE ») encadrent :
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>l'accès et l'usage du service SaaS « Gilbert » (ci-après le « Service ») (partie CGU),</li>
                    <li>la souscription, la facturation et la fourniture du Service (partie CGV).</li>
                  </ul>
                  <p className="mt-4">
                    Les CGE s'appliquent à toute utilisation du Service par :
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>des consommateurs (B2C),</li>
                    <li>des professionnels (B2B), incluant : indépendants, entreprises, associations, administrations, établissements d'enseignement, etc.</li>
                  </ul>
                  <p className="mt-4">
                    En cas de contradiction :
                  </p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>les clauses spécifiquement marquées B2C priment pour les consommateurs,</li>
                    <li>les clauses spécifiquement marquées B2B priment pour les professionnels.</li>
                  </ul>
                  <p className="mt-4">
                    Toute utilisation du Service implique l'acceptation sans réserve des CGE par l'Utilisateur/Client.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Identification de l'Éditeur</h2>
                  <p>
                    Le Service est édité par :
                  </p>
                  <p className="mt-2 font-semibold">
                    LEXIA FRANCE, société par actions simplifiée au capital social de 500 €, dont le siège social est situé au MAISON DE LA TECHNOPOLE 6 RUE LEONARD DE VINCI 53810 CHANGE, immatriculée au Registre du Commerce et des Sociétés de Laval sous le numéro 928 955 426, SIRET 92895542600020, TVA intracommunautaire FR30928955426, représentée par M. Mathis Escriva, Président, dûment habilité aux fins des présentes (ci-après « LEXIA »).
                  </p>
                  <p className="mt-4">
                    Email de contact (support / juridique / RGPD) : <a href="mailto:mathis@lexiapro.fr" className="text-blue-600 hover:underline">mathis@lexiapro.fr</a>
                  </p>
                  <p>
                    Adresse de notification légale : siège social susvisé.
                  </p>
                  <p className="mt-4">
                    Hébergement : le Service est hébergé par OVH (ou ses entités affiliées et sous-traitants d'hébergement, le cas échéant).
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Définitions</h2>
                  <ul className="space-y-3">
                    <li><strong>Utilisateur</strong> : toute personne physique utilisant le Service, à titre privé ou professionnel.</li>
                    <li><strong>Client</strong> : (i) l'Utilisateur qui souscrit un abonnement à titre individuel, ou (ii) l'organisation (B2B) qui souscrit un abonnement pour plusieurs Utilisateurs.</li>
                    <li><strong>Compte</strong> : espace personnel/organisationnel permettant l'accès au Service.</li>
                    <li><strong>Contenus</strong> : audios importés/enregistrés et éléments générés (transcriptions, résumés, comptes rendus, exports, métadonnées associées).</li>
                    <li><strong>Packs</strong> : crédits additionnels payants permettant d'augmenter le quota audio au-delà de l'abonnement.</li>
                    <li><strong>Prestataires techniques</strong> : prestataires et sous-traitants intervenant pour fournir le Service (infrastructure, traitement, sécurité, etc.).</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Description du Service</h2>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">4.1 Fonctionnalités principales</h3>
                  <p>
                    Gilbert est un service SaaS permettant notamment :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>Téléversement de fichiers audio,</li>
                    <li>Enregistrement live et/ou import (ex. dictaphone),</li>
                    <li>Transcription et structuration des échanges (y compris identification/diarisation des interlocuteurs selon la qualité audio),</li>
                    <li>Génération de résumés / synthèses / comptes rendus par traitements automatisés,</li>
                    <li>Exports via des modèles (templates) et fonctionnalités associées,</li>
                    <li>Accès sur web, mobile, desktop.</li>
                  </ul>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">4.2 Formats, limites et contraintes</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Formats acceptés : MP3 (évolutif).</li>
                    <li>Durée maximale par audio : 5 heures.</li>
                    <li>La qualité des résultats dépend de la qualité audio, du bruit ambiant, de la diction, des accents, du réseau, des paramètres matériels/logiciels.</li>
                  </ul>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">4.3 API Enterprise</h3>
                  <p>
                    LEXIA peut proposer une API Enterprise (accès programmatique) sous contrat séparé (conditions, sécurité, quotas et support spécifiques).
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Évolution du Service — Technologies et Prestataires</h2>
                  <p>
                    LEXIA améliore continuellement le Service. À ce titre, LEXIA se réserve le droit de :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>faire évoluer les modèles, algorithmes et composants techniques,</li>
                    <li>remplacer ou modifier les Prestataires techniques,</li>
                    <li>optimiser frugalité, sécurité, performance, et robustesse,</li>
                    <li>faire évoluer les formats supportés, limites techniques et fonctionnalités,</li>
                    <li>tout en maintenant un niveau de service cohérent avec l'offre souscrite.</li>
                  </ul>
                  <p className="mt-4">
                    LEXIA s'engage à sélectionner des Prestataires techniques offrant des garanties suffisantes en matière de sécurité et de protection des données, et à maintenir une conformité aux exigences applicables (notamment RGPD), selon les modalités prévues aux présentes et en Annexe 2 (DPA) pour le B2B.
                  </p>
                  <p className="mt-4">
                    En cas de modification substantielle affectant les fonctionnalités essentielles, LEXIA informera le Client par tout moyen (email, notification in-app) dans un délai raisonnable.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Création de Compte — Accès — Sécurité</h2>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">6.1 Création de Compte</h3>
                  <p>
                    L'accès au Service nécessite la création d'un Compte. L'Utilisateur s'engage à fournir des informations exactes et à jour.
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">6.2 Comptes partagés</h3>
                  <p>
                    Les comptes partagés (plusieurs personnes utilisant un même Compte) sont interdits.
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">6.3 Authentification</h3>
                  <p>
                    L'accès s'effectue via identifiants (email/mot de passe) et/ou SSO selon l'offre.
                  </p>
                  <p className="mt-2">
                    L'Utilisateur est responsable de la confidentialité de ses identifiants et de toute activité réalisée depuis son Compte.
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">6.4 Journalisation</h3>
                  <p>
                    LEXIA conserve des logs de connexion (horodatage, identifiants techniques, événements de sécurité) pendant 12 mois pour assurer la sécurité, prévenir la fraude et maintenir le Service.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Essai gratuit</h2>
                  <p>
                    LEXIA propose un essai gratuit incluant 4 heures d'audio cumulées.
                  </p>
                  <p className="mt-2">
                    À l'atteinte de ce plafond, un hard stop s'applique : l'Utilisateur devra souscrire un abonnement et/ou acheter des Packs pour continuer.
                  </p>
                  <p className="mt-2">
                    Aucune carte bancaire n'est requise pour activer l'essai gratuit.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">14. Propriété intellectuelle</h2>
                  <p>
                    Le Service, ses logiciels, interfaces, marques, logos, éléments graphiques, documentation, ainsi que toute propriété intellectuelle y afférente, sont la propriété exclusive de LEXIA ou de ses concédants.
                  </p>
                  <p className="mt-4">
                    LEXIA concède au Client/Utilisateur une licence non exclusive, non transférable, pour la durée du contrat, aux seules fins d'accès et d'utilisation du Service conformément aux CGE.
                  </p>
                  <p className="mt-4">
                    Sont notamment interdits :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>reverse engineering, décompilation, reproduction du Service,</li>
                    <li>extraction/scraping systématique,</li>
                    <li>contournement des mesures de sécurité,</li>
                    <li>utilisation visant à créer ou entraîner un service concurrent,</li>
                    <li>surcharge volontaire (attaque, tests de charge non autorisés).</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">15. Contenus — Propriété — Responsabilités</h2>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">15.1 Propriété des Contenus</h3>
                  <p>
                    Les Contenus importés et générés (transcriptions, résumés, comptes rendus) appartiennent au Client/Utilisateur.
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">15.2 Licence technique</h3>
                  <p>
                    Le Client/Utilisateur concède à LEXIA une licence strictement nécessaire pour traiter les Contenus aux seules fins de fourniture du Service (transcrire, structurer, résumer, permettre l'affichage, et fournir les exports).
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">15.3 Obligations du Client/Utilisateur</h3>
                  <p>
                    Le Client/Utilisateur garantit :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>disposer des droits nécessaires sur les audios,</li>
                    <li>avoir informé les personnes concernées et obtenu les autorisations/consentements requis,</li>
                    <li>respecter la réglementation applicable (vie privée, droit du travail, secrets, etc.).</li>
                  </ul>
                  <p className="mt-4">
                    LEXIA ne saurait être responsable des Contenus téléversés illégalement, ni de l'absence d'autorisation d'enregistrement/traitement.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">16. Conservation — Suppression — Exports</h2>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">16.1 Audios</h3>
                  <p>
                    Les fichiers audio sont supprimés immédiatement après traitement (après l'opération nécessaire à la transcription), sauf conservation technique transitoire strictement nécessaire.
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">16.2 Transcriptions et résumés</h3>
                  <p>
                    Les transcriptions et résumés sont conservés tant que le Compte est actif, afin de permettre à l'Utilisateur d'y accéder.
                  </p>
                  <p className="mt-2">
                    L'Utilisateur peut supprimer manuellement ses transcriptions/résumés à tout moment.
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">16.3 Exports</h3>
                  <p>
                    LEXIA ne conserve pas les exports : ils sont générés et récupérés par l'Utilisateur. Des traces techniques temporaires peuvent exister le temps strictement nécessaire à la génération et au téléchargement.
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">16.4 Sauvegardes</h3>
                  <p>
                    LEXIA effectue des sauvegardes de sécurité. Après suppression par l'Utilisateur, la purge complète des sauvegardes intervient dans un délai maximal de 30 jours, sauf obligation légale ou contrainte technique documentée.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">17. Support — Accès exceptionnel aux Contenus</h2>
                  <p>
                    Par défaut, LEXIA n'accède pas aux Contenus des Utilisateurs.
                  </p>
                  <p className="mt-2">
                    En cas de demande de support, l'Utilisateur/Client peut autoriser expressément un accès ponctuel, limité au strict nécessaire, avec traçabilité, habilitations et confidentialité.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">18. Disponibilité — Maintenance — Obligation de moyens</h2>
                  <p>
                    Le Service est fourni en best efforts. LEXIA vise une disponibilité 24/7, sous réserve :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>de maintenance planifiée,</li>
                    <li>d'incidents techniques,</li>
                    <li>d'événements hors contrôle raisonnable (force majeure, opérateurs, etc.).</li>
                  </ul>
                  <p className="mt-4">
                    LEXIA peut suspendre temporairement le Service pour maintenance ou sécurité. LEXIA s'efforcera, lorsque possible, d'informer les Utilisateurs à l'avance.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">19. Usage acceptable — Suspension — Résiliation</h2>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">19.1 Usage acceptable</h3>
                  <p>
                    Il est interdit d'utiliser le Service pour :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>diffuser/traiter des contenus illégaux (atteinte à la vie privée, haine, harcèlement, fraude, etc.),</li>
                    <li>enregistrer/importer des audios sans droits/consentements,</li>
                    <li>porter atteinte à la sécurité du Service, perturber ou surcharger l'infrastructure,</li>
                    <li>détourner le Service (extraction massive, automatisation abusive, revente non autorisée),</li>
                    <li>contourner des quotas, protections ou restrictions techniques.</li>
                  </ul>
                  <p className="mt-4">
                    LEXIA se réserve le droit d'ajouter des mesures de protection (rate limiting, contrôles anti-abus).
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">19.2 Suspension / Résiliation</h3>
                  <p>
                    LEXIA peut suspendre ou résilier l'accès au Service, notamment en cas de :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>non-paiement,</li>
                    <li>usage illicite ou non conforme,</li>
                    <li>risque de sécurité,</li>
                    <li>fraude ou tentative de contournement,</li>
                    <li>atteinte aux droits de tiers.</li>
                  </ul>
                  <p className="mt-4">
                    En cas d'urgence (sécurité/illégalité), la suspension peut être immédiate.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">20. Limites des traitements automatisés — Absence de garantie</h2>
                  <p>
                    Le Service repose sur des traitements automatisés (transcription, diarisation, synthèse) pouvant comporter des erreurs.
                  </p>
                  <p className="mt-4">
                    Le Client/Utilisateur :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>reconnaît que les résultats doivent être vérifiés avant usage,</li>
                    <li>demeure responsable de l'usage qu'il fait des résultats,</li>
                    <li>reconnaît que le Service ne constitue pas un conseil juridique, médical, financier ou réglementaire.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">21. Responsabilité — Limitation</h2>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">21.1 Dispositions générales</h3>
                  <p>
                    LEXIA est tenue à une obligation de moyens.
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">21.2 Exclusions (dans les limites légales)</h3>
                  <p>
                    LEXIA n'est pas responsable :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>des dommages indirects (perte de chance, manque à gagner, atteinte à l'image, etc.),</li>
                    <li>des dommages liés aux Contenus fournis par le Client/Utilisateur,</li>
                    <li>des dommages causés par une utilisation non conforme ou par l'absence d'autorisations/consentements,</li>
                    <li>des interruptions imputables au réseau, opérateurs, services tiers, appareils, ou événements externes.</li>
                  </ul>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">21.3 Plafond (B2B)</h3>
                  <p>
                    Pour les Clients professionnels, la responsabilité totale de LEXIA, toutes causes confondues, est plafonnée au montant effectivement payé par le Client au titre des 12 derniers mois précédant le fait générateur.
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">21.4 B2C</h3>
                  <p>
                    Pour les consommateurs, les limitations s'appliquent dans le respect des dispositions impératives (notamment garanties légales et responsabilité en cas de faute lourde/dol).
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">21.5 Garantie / indemnisation (B2B)</h3>
                  <p>
                    Le Client professionnel garantit LEXIA contre toute réclamation liée :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>aux Contenus (droits, consentements, illégalité),</li>
                    <li>à l'usage du Service,</li>
                    <li>à une violation des CGE.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">22. Données personnelles — RGPD</h2>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">22.1 B2C (consommateurs)</h3>
                  <p>
                    LEXIA agit en qualité de responsable de traitement pour :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>la gestion du Compte,</li>
                    <li>la fourniture du Service,</li>
                    <li>la facturation,</li>
                    <li>la sécurité (logs),</li>
                    <li>l'assistance support (si autorisée).</li>
                  </ul>
                  <p className="mt-4">
                    Les demandes relatives aux droits RGPD peuvent être adressées à : <a href="mailto:mathis@lexiapro.fr" className="text-blue-600 hover:underline">mathis@lexiapro.fr</a>.
                  </p>
                  <p className="mt-2">
                    L'Utilisateur peut également saisir l'autorité de contrôle compétente (CNIL).
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">22.2 B2B (professionnels)</h3>
                  <p>
                    Pour le traitement des données personnelles contenues dans les Contenus, LEXIA agit en qualité de sous-traitant et le Client en qualité de responsable de traitement.
                  </p>
                  <p className="mt-2">
                    Un accord de sous-traitance (DPA) conforme à l'article 28 RGPD est annexé (Annexe 2).
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">22.3 Localisation</h3>
                  <p>
                    Les traitements et l'hébergement sont réalisés au sein de l'Union Européenne.
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">22.4 Sous-traitants</h3>
                  <p>
                    LEXIA peut recourir à des Prestataires techniques. La liste peut être fournie sur demande.
                  </p>
                  <p className="mt-2">
                    Pour le B2B, le Client bénéficie d'une autorisation générale et d'un droit d'opposition selon Annexe 2.
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">22.5 Absence d'entraînement sur données Client</h3>
                  <p>
                    LEXIA n'utilise pas les Contenus des Utilisateurs/Clients pour entraîner ou améliorer ses modèles, sauf instruction/accord distinct explicite.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">23. Modification des CGE</h2>
                  <p>
                    LEXIA peut modifier les CGE. En cas de modification substantielle, LEXIA informera le Client/Utilisateur par tout moyen raisonnable.
                  </p>
                  <p className="mt-2">
                    L'utilisation du Service après entrée en vigueur des CGE mises à jour vaut acceptation.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">24. Force majeure</h2>
                  <p>
                    LEXIA ne pourra être tenue responsable en cas d'événement de force majeure ou d'événement échappant à son contrôle raisonnable (panne majeure d'infrastructure, catastrophe, interruption opérateur, etc.).
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">25. Droit applicable — Juridiction</h2>
                  <p>
                    Les CGE sont régies par le droit français.
                  </p>
                  <p className="mt-4">
                    <strong>B2C</strong> : le consommateur peut saisir les tribunaux compétents selon les règles légales applicables.
                  </p>
                  <p className="mt-2">
                    <strong>B2B</strong> : compétence exclusive des tribunaux du ressort de Laval, sauf disposition impérative contraire.
                  </p>
                </section>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default CGUPage;
