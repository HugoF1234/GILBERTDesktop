/**
 * PrivacyPolicyPage - Page de la Politique de Confidentialité
 */

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Shield } from 'lucide-react';
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

const PrivacyPolicyPage: React.FC = () => {
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
            <div className="p-2 bg-green-100 rounded-lg">
              <Shield className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Politique de Confidentialité</h1>
              <p className="text-sm text-gray-500 mt-1">Comment Gilbert protège vos données personnelles</p>
              <p className="text-xs text-gray-400 mt-1">Dernière mise à jour : 28/12/2025</p>
            </div>
          </div>
        </motion.div>

        {/* Content */}
        <motion.div variants={itemVariants}>
          <Card className="shadow-lg">
            <CardContent className="pt-6 prose prose-slate max-w-none">
              <div className="space-y-6 text-gray-700">
                <section>
                  <p>
                    La présente Politique de confidentialité explique comment LEXIA FRANCE (« LEXIA », « nous ») collecte, utilise et protège les données personnelles dans le cadre de l'utilisation du service SaaS Gilbert (le « Service »).
                  </p>
                  <p className="mt-4">
                    Elle est rédigée conformément au Règlement (UE) 2016/679 (RGPD) et aux recommandations de la CNIL sur l'information des personnes.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">1) Responsable de traitement et contact</h2>
                  <p>
                    <strong>Responsable de traitement (B2C et données de compte B2B) :</strong>
                  </p>
                  <p className="mt-2">
                    LEXIA FRANCE, SAS (informations complètes disponibles dans les Mentions légales).
                  </p>
                  <p className="mt-4">
                    <strong>Contact (RGPD / support / juridique)</strong> : <a href="mailto:mathis@lexiapro.fr" className="text-blue-600 hover:underline">mathis@lexiapro.fr</a>
                  </p>
                  <p className="mt-2">
                    À défaut de DPO désigné, ce contact centralise les demandes relatives aux données personnelles.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">2) À qui s'applique cette politique ?</h2>
                  <p>
                    Cette politique s'applique :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>aux utilisateurs particuliers (B2C) ;</li>
                    <li>aux utilisateurs professionnels (B2B) ;</li>
                    <li>aux visiteurs du site et utilisateurs du Service (y compris essais gratuits).</li>
                  </ul>
                  <p className="mt-4">
                    <strong>Important (B2B)</strong> : lorsque votre organisation souscrit le Service, LEXIA peut agir :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>comme responsable de traitement pour les données de compte, de facturation et de sécurité,</li>
                    <li>comme sous-traitant pour les données personnelles contenues dans les audios/transcriptions, traitées pour le compte du client professionnel (responsable de traitement). Les règles de sous-traitance figurent dans l'Annexe DPA (article 28 RGPD).</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">3) Quelles données collectons-nous ?</h2>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">3.1 Données de compte et d'utilisation</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Identité de compte</strong> : email, identifiant, informations de profil éventuelles.</li>
                    <li><strong>Données de souscription et facturation</strong> : type d'abonnement, historique de paiement, factures, informations nécessaires au paiement (traitées via prestataires de paiement).</li>
                    <li><strong>Données d'usage</strong> : quotas consommés, événements techniques (ex. erreurs), paramètres.</li>
                  </ul>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">3.2 Données de sécurité</h3>
                  <p>
                    Logs de connexion (ex. date/heure, adresse IP, identifiants techniques, événements liés à la sécurité).
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">3.3 Données de contenu</h3>
                  <p>
                    Selon l'utilisation du Service :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>fichiers audio importés / enregistrements,</li>
                    <li>transcriptions, résumés et contenus structurés générés,</li>
                    <li>métadonnées associées (ex. durée, langue, horodatages).</li>
                  </ul>
                  <p className="mt-4 italic text-gray-600">
                    Remarque : le Service peut segmenter les intervenants (diarisation) selon les caractéristiques audio ; il ne constitue pas un système d'identification biométrique et n'a pas vocation à authentifier des personnes. (Le nommage des intervenants peut dépendre de l'utilisateur ou de paramètres métier.)
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">4) À quelles fins utilisons-nous ces données ? (Finalités)</h2>
                  <p>
                    Nous traitons les données personnelles pour :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li><strong>Fournir le Service</strong> : créer et gérer le compte, permettre la transcription/synthèse et l'accès aux résultats.</li>
                    <li><strong>Gérer l'abonnement et la facturation</strong> : exécuter le contrat, gérer les paiements, la comptabilité.</li>
                    <li><strong>Assurer la sécurité et prévenir la fraude</strong> : journalisation, détection d'accès anormaux, protection de l'infrastructure.</li>
                    <li><strong>Support et assistance</strong> : répondre aux demandes et incidents (avec accès aux contenus uniquement sur autorisation expresse, voir §9).</li>
                    <li><strong>Améliorer le Service (fonctionnel et technique)</strong> : correction de bugs, performance, ergonomie, sans utiliser les contenus clients pour entraîner les modèles (voir §10).</li>
                  </ul>
                  <p className="mt-4">
                    Les exigences d'information sur ces finalités découlent notamment des articles 12–14 RGPD.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">5) Bases légales (RGPD)</h2>
                  <p>
                    Selon les cas, les traitements reposent sur :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li><strong>Exécution du contrat (RGPD art. 6(1)(b))</strong> : création de compte, fourniture du Service, facturation.</li>
                    <li><strong>Obligation légale (art. 6(1)(c))</strong> : obligations comptables/fiscales, demandes légales.</li>
                    <li><strong>Intérêt légitime (art. 6(1)(f))</strong> : sécurité, prévention fraude, amélioration technique (sans atteinte disproportionnée).</li>
                    <li><strong>Consentement (art. 6(1)(a))</strong> : uniquement lorsque requis, notamment pour certains cookies/traceurs non essentiels (voir §12).</li>
                  </ul>
                  <p className="mt-4">
                    <strong>B2B — sous-traitance</strong> : pour les contenus traités pour le compte d'un client professionnel, la base légale est celle déterminée par ce client en tant que responsable de traitement ; LEXIA agit sur instruction (article 28).
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">6) Qui reçoit vos données ? (Destinataires)</h2>
                  <p>
                    Vos données peuvent être accessibles :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li><strong>En interne chez LEXIA</strong> : uniquement aux personnes habilitées, dans la limite du besoin (support, sécurité, administration).</li>
                    <li><strong>Aux prestataires techniques</strong> intervenant pour fournir le Service : hébergement, infrastructure, sécurité, paiement, etc., agissant en sous-traitance et soumis à des obligations de confidentialité et de sécurité.</li>
                    <li><strong>Aux autorités</strong> : uniquement si la loi l'impose ou sur demande légalement fondée.</li>
                  </ul>
                  <p className="mt-4">
                    Liste des sous-traitants : elle peut être fournie sur demande. En B2B, les modalités de changement et le droit d'opposition sont définis dans le DPA (autorisation générale + opposition motivée).
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">7) Où sont traitées vos données ? (Localisation)</h2>
                  <p>
                    Les traitements et l'hébergement liés au Service sont réalisés au sein de l'Union européenne.
                  </p>
                  <p className="mt-2">
                    Nous n'organisons pas de transferts hors UE dans le cadre normal de fourniture du Service.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">8) Combien de temps conservons-nous vos données ? (Durées)</h2>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">8.1 Audios</h3>
                  <p>
                    Les fichiers audio sont supprimés immédiatement après traitement (après l'opération nécessaire à la transcription), sauf conservation technique transitoire strictement nécessaire.
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">8.2 Transcriptions, résumés et contenus générés</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Conservés tant que le compte est actif, afin de permettre à l'utilisateur d'y accéder.</li>
                    <li>L'utilisateur peut supprimer manuellement ses contenus à tout moment.</li>
                  </ul>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">8.3 Exports</h3>
                  <p>
                    LEXIA ne conserve pas les exports : ils sont générés et récupérés par l'utilisateur (des traces techniques temporaires peuvent exister le temps strictement nécessaire à la génération/téléchargement).
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">8.4 Logs de connexion</h3>
                  <p>
                    Conservés 12 mois (sécurité / prévention fraude / investigations).
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">8.5 Sauvegardes</h3>
                  <p>
                    Sauvegardes de sécurité : en cas de suppression par l'utilisateur, la purge complète des sauvegardes intervient au plus tard dans un délai de 30 jours, sauf obligation légale ou contrainte technique documentée.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">9) Support et accès aux contenus</h2>
                  <p>
                    Par défaut, LEXIA n'accède pas aux contenus (transcriptions/résumés) des utilisateurs.
                  </p>
                  <p className="mt-2">
                    En cas de demande de support, un accès ponctuel à certains contenus peut être réalisé uniquement sur autorisation expresse de l'utilisateur / du client, limité au strict nécessaire, avec traçabilité et habilitations internes.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">10) Entraînement de modèles / réutilisation des contenus</h2>
                  <p>
                    LEXIA n'utilise pas les contenus (audios, transcriptions, résumés) des utilisateurs/clients pour entraîner ou améliorer des modèles d'IA, sauf accord explicite distinct (opt-in contractuel) le cas échéant.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">11) Sécurité</h2>
                  <p>
                    LEXIA met en œuvre des mesures techniques et organisationnelles proportionnées aux risques, notamment :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>contrôle d'accès et habilitations,</li>
                    <li>journalisation et détection d'événements de sécurité,</li>
                    <li>mesures de protection des transmissions et de l'infrastructure,</li>
                    <li>sauvegardes et procédures de restauration.</li>
                  </ul>
                  <p className="mt-4">
                    Aucune mesure n'étant infaillible, le risque zéro n'existe pas ; en cas d'incident affectant des données personnelles, LEXIA applique les obligations de notification prévues par le RGPD (notamment en B2B via le DPA).
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">12) Cookies et traceurs</h2>
                  <p>
                    Le site et/ou le Service peut utiliser des cookies/traceurs :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li><strong>strictement nécessaires au fonctionnement</strong> (exemptés de consentement),</li>
                    <li><strong>mesure d'audience et/ou personnalisation</strong> : soumis au consentement lorsque requis.</li>
                  </ul>
                  <p className="mt-4">
                    Lorsque la loi l'exige, votre consentement est recueilli via un bandeau/outil de gestion des cookies. Vous pouvez retirer votre consentement à tout moment via les paramètres proposés.
                  </p>
                  <p className="mt-2">
                    La CNIL précise les conditions d'exemption et de consentement pour les cookies/traceurs.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">13) Vos droits</h2>
                  <p>
                    Vous disposez (selon les conditions RGPD) des droits :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>d'accès, rectification, effacement,</li>
                    <li>limitation, opposition,</li>
                    <li>portabilité,</li>
                    <li>directives post-mortem (selon le droit français).</li>
                  </ul>
                  <p className="mt-4">
                    LEXIA répond aux demandes dans les délais prévus (en principe 1 mois, prorogeable dans certains cas).
                  </p>
                  <p className="mt-4">
                    <strong>Exercer vos droits</strong> : écrivez à <a href="mailto:mathis@lexiapro.fr" className="text-blue-600 hover:underline">mathis@lexiapro.fr</a> en précisant :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>l'objet de votre demande,</li>
                    <li>l'email du compte concerné,</li>
                    <li>et toute information utile à votre identification.</li>
                  </ul>
                  <p className="mt-4">
                    Vous pouvez également introduire une réclamation auprès de la CNIL.
                  </p>
                  <p className="mt-4">
                    <strong>B2B (contenus)</strong> : si vous êtes utilisateur d'une organisation, certaines demandes peuvent devoir être relayées par votre organisation (responsable de traitement) selon son paramétrage et ses obligations internes.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">14) Données sensibles et précautions d'usage</h2>
                  <p>
                    Le Service n'a pas vocation à traiter intentionnellement des catégories particulières de données (ex. santé, opinions politiques, etc.). Toutefois, des informations sensibles peuvent être contenues dans les enregistrements soumis par l'utilisateur.
                  </p>
                  <p className="mt-4">
                    Il appartient à l'utilisateur / au client :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>d'évaluer la pertinence de téléverser de tels contenus,</li>
                    <li>d'obtenir les autorisations nécessaires,</li>
                    <li>et de configurer ses pratiques internes en conséquence.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">15) Mineurs</h2>
                  <p>
                    Le Service n'est pas destiné aux mineurs sans autorisation parentale ou sans cadre établi par un responsable légal/organisation. Si vous estimez qu'un mineur nous a transmis des données sans autorisation, contactez-nous.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">16) Modifications de la politique</h2>
                  <p>
                    LEXIA peut mettre à jour la présente politique pour refléter des évolutions légales, techniques ou fonctionnelles. La version en vigueur est celle publiée/accessible au moment de la consultation.
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

export default PrivacyPolicyPage;

