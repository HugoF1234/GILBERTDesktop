/**
 * LegalNoticePage - Page des Mentions Légales
 */

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Scale } from 'lucide-react';
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

const LegalNoticePage: React.FC = () => {
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
            <div className="p-2 bg-orange-100 rounded-lg">
              <Scale className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Mentions Légales</h1>
              <p className="text-sm text-gray-500 mt-1">Informations légales concernant Gilbert et son site internet</p>
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
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">1) Éditeur du site</h2>
                  <p>
                    Le site gilbert-assistant.fr est édité par :
                  </p>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mt-4">
                    <p className="font-semibold mb-2">LEXIA FRANCE</p>
                    <p>Société par actions simplifiée (SAS) au capital social de 500 €</p>
                    <p className="mt-2">
                      <strong>Siège social</strong> : MAISON DE LA TECHNOPOLE, 6 rue Léonard de Vinci, 53810 Changé, France
                    </p>
                    <p className="mt-2">
                      <strong>Immatriculée au RCS de Laval</strong> sous le numéro 928 955 426
                    </p>
                    <p className="mt-2">
                      <strong>SIRET</strong> : 92895542600020
                    </p>
                    <p className="mt-2">
                      <strong>TVA intracommunautaire</strong> : FR30928955426
                    </p>
                    <p className="mt-4">
                      <strong>Représentant légal</strong> : M. Mathis Escriva, Président
                    </p>
                    <p className="mt-2">
                      <strong>Directeur de la publication</strong> : M. Mathis Escriva
                    </p>
                    <p className="mt-4">
                      <strong>Contact</strong> : <a href="mailto:mathis@lexiapro.fr" className="text-blue-600 hover:underline">mathis@lexiapro.fr</a>
                    </p>
                    <p className="mt-2">
                      <strong>Téléphone</strong> : [À RENSEIGNER]
                    </p>
                  </div>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">2) Hébergement</h2>
                  <p>
                    Le site et/ou le Service est/sont hébergé(s) par :
                  </p>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mt-4">
                    <p className="font-semibold mb-2">OVH SAS</p>
                    <p><strong>Siège social</strong> : 2 rue Kellermann, 59100 Roubaix, France</p>
                    <p className="mt-2"><strong>Téléphone</strong> : +33 (0)9 72 10 10 07</p>
                  </div>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">3) Accès au service</h2>
                  <p>
                    Le Service Gilbert est un logiciel fourni sous forme de SaaS (Software as a Service).
                  </p>
                  <p className="mt-2">
                    Les conditions d'accès, d'utilisation, de souscription et de facturation sont définies dans les Conditions Générales d'Utilisation et de Vente (CGE) accessibles sur gilbert-assistant.fr (ou dans l'application au moment de la souscription).
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">4) Propriété intellectuelle</h2>
                  <p>
                    L'ensemble du site, du Service, de ses interfaces, contenus éditoriaux, éléments graphiques, logos, marques, noms de domaine, bases de données (hors contenus déposés par les utilisateurs) ainsi que tout logiciel associé sont protégés par le droit de la propriété intellectuelle et sont la propriété exclusive de LEXIA FRANCE et/ou de ses concédants.
                  </p>
                  <p className="mt-4">
                    Toute reproduction, représentation, modification, publication, adaptation, extraction ou exploitation non autorisée, totale ou partielle, de tout ou partie du site ou du Service, par quelque procédé que ce soit, est interdite, sauf autorisation écrite préalable de LEXIA.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">5) Contenus déposés par les utilisateurs</h2>
                  <p>
                    Les contenus (notamment fichiers audio, transcriptions, résumés, exports) déposés ou générés via le Service restent sous la responsabilité de leurs auteurs / titulaires de droits.
                  </p>
                  <p className="mt-4">
                    L'utilisateur garantit disposer des droits et autorisations nécessaires (y compris, le cas échéant, le consentement des personnes enregistrées) et s'engage à respecter la réglementation applicable.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">6) Responsabilité</h2>
                  <p>
                    LEXIA s'efforce d'assurer l'exactitude et la mise à jour des informations diffusées sur le site. Toutefois, LEXIA ne peut garantir l'absence d'erreurs, d'omissions ou d'indisponibilités temporaires.
                  </p>
                  <p className="mt-4">
                    LEXIA ne saurait être tenue responsable :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>des dommages indirects résultant de l'utilisation du site ou du Service,</li>
                    <li>des interruptions liées aux réseaux, fournisseurs d'accès, ou facteurs hors de son contrôle raisonnable,</li>
                    <li>de l'usage fait par l'utilisateur des résultats générés (transcriptions, synthèses, comptes rendus), lesquels peuvent comporter des erreurs et doivent être vérifiés.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">7) Données personnelles (RGPD)</h2>
                  <p>
                    LEXIA traite des données personnelles dans le cadre :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>de la gestion des comptes utilisateurs,</li>
                    <li>de la fourniture du Service,</li>
                    <li>de la sécurité (notamment journaux de connexion),</li>
                    <li>et du support (le cas échéant).</li>
                  </ul>
                  <p className="mt-4">
                    Pour toute question relative aux données personnelles ou pour exercer vos droits (accès, rectification, suppression, opposition, limitation, etc.) :
                  </p>
                  <p className="mt-2">
                    📩 <a href="mailto:mathis@lexiapro.fr" className="text-blue-600 hover:underline">mathis@lexiapro.fr</a>
                  </p>
                  <p className="mt-4">
                    Pour plus d'informations, se référer :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>à la <button onClick={() => { sounds.click(); navigate('/privacy'); }} className="text-blue-600 hover:underline">Politique de confidentialité</button> (si publiée sur le site / dans l'app),</li>
                    <li>et/ou aux CGE (notamment l'annexe DPA pour les clients professionnels).</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">8) Cookies</h2>
                  <p>
                    Le site peut utiliser des cookies et/ou traceurs (notamment pour son fonctionnement, la mesure d'audience, l'amélioration de l'expérience).
                  </p>
                  <p className="mt-2">
                    Lorsque requis, le consentement est recueilli via un bandeau cookies. Pour plus d'informations, se référer à la politique cookies (si publiée).
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">9) Signalement de contenu illicite</h2>
                  <p>
                    Conformément aux dispositions applicables, tout utilisateur peut signaler un contenu ou un comportement manifestement illicite via : <a href="mailto:mathis@lexiapro.fr" className="text-blue-600 hover:underline">mathis@lexiapro.fr</a>.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">10) Droit applicable</h2>
                  <p>
                    Le site et le Service sont soumis au droit français.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">11) Application Mobile Gilbert</h2>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">Données collectées sur mobile</h3>
                  <p>
                    L'application mobile Gilbert collecte les données suivantes :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li><strong>Enregistrements audio</strong> : captés via le microphone de votre appareil, uniquement lorsque vous initiez un enregistrement. Ces fichiers sont transmis à nos serveurs pour transcription et analyse par intelligence artificielle.</li>
                    <li><strong>Stockage local temporaire</strong> : les enregistrements sont stockés localement sur votre appareil jusqu'à leur transmission réussie à nos serveurs.</li>
                  </ul>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">Permissions requises</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>Microphone</strong> : nécessaire pour enregistrer vos réunions</li>
                    <li><strong>Notifications</strong> : pour vous informer de l'état de vos transcriptions</li>
                  </ul>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">Enregistrement en arrière-plan</h3>
                  <p>
                    L'application peut continuer à enregistrer lorsqu'elle est en arrière-plan. Un indicateur visuel dans la barre de statut vous informe qu'un enregistrement est en cours. Vous gardez le contrôle total et pouvez arrêter l'enregistrement à tout moment.
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">Suppression des données</h3>
                  <p>
                    Vous pouvez supprimer vos enregistrements et transcriptions à tout moment depuis l'application ou depuis votre espace web sur gilbert-assistant.ovh. La désinstallation de l'application supprime toutes les données locales.
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

export default LegalNoticePage;

