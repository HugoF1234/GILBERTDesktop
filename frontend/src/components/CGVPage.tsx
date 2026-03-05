/**
 * CGVPage - Page des Conditions Générales de Vente
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

const CGVPage: React.FC = () => {
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
            <div className="p-2 bg-purple-100 rounded-lg">
              <FileText className="h-6 w-6 text-purple-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Conditions Générales de Vente</h1>
          </div>
        </motion.div>

        {/* Content */}
        <motion.div variants={itemVariants}>
          <Card className="shadow-lg">
            <CardContent className="pt-6 prose prose-slate max-w-none">
              <div className="space-y-6 text-gray-700">
                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Offre — Abonnement — Quotas</h2>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">8.1 Offre « Pro » (abonnement unique, par Utilisateur)</h3>
                  <p>
                    Sauf stipulations particulières, l'offre standard est l'abonnement « Pro », souscrit par Utilisateur.
                  </p>
                  <p className="mt-4">
                    L'abonnement « Pro » inclut :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>40 heures d'audio par mois, par Utilisateur (quota mensuel),</li>
                    <li>transcriptions et résumés illimités sous réserve du respect du quota audio et des CGE.</li>
                  </ul>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">8.2 Dépassement — Packs</h3>
                  <p>
                    Au-delà du quota mensuel, l'utilisation nécessite l'achat de Packs.
                  </p>
                  <p className="mt-4">
                    Les Packs sont :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>non remboursables,</li>
                    <li>non transférables,</li>
                    <li>soumis aux conditions indiquées lors de l'achat (volume, éventuelle durée de validité, modalités de consommation).</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Prix — Informations précontractuelles</h2>
                  <p>
                    Les prix de l'abonnement et des Packs sont indiqués :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>sur gilbert-assistant.fr et/ou</li>
                    <li>dans le parcours de commande / paiement (checkout) au moment de l'achat.</li>
                  </ul>
                  <p className="mt-4">
                    Le prix applicable est celui affiché et accepté au moment de la commande (ou du renouvellement).
                  </p>
                  <p className="mt-4">
                    LEXIA peut faire évoluer ses tarifs. En cas de changement tarifaire, le nouveau tarif s'applique à compter du prochain renouvellement, sous réserve d'une information préalable raisonnable.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Paiement</h2>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">10.1 Moyens de paiement</h3>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong>B2C et B2B standard</strong> : paiement par carte bancaire.</li>
                    <li><strong>B2B sur devis</strong> : paiement possible par virement selon le devis/bon de commande et les modalités convenues.</li>
                  </ul>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">10.2 Défaut de paiement</h3>
                  <p>
                    En cas de défaut de paiement, LEXIA peut :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>suspendre l'accès au Service après relance,</li>
                    <li>résilier l'abonnement en cas de non-régularisation,</li>
                    <li>sans préjudice de tout dommage-intérêt ou recours.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Durée — Renouvellement — Résiliation</h2>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">11.1 Durée</h3>
                  <p>
                    L'abonnement est souscrit au choix du Client :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>mensuellement ou</li>
                    <li>annuellement.</li>
                  </ul>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">11.2 Renouvellement</h3>
                  <p>
                    Sauf résiliation, l'abonnement se renouvelle automatiquement par tacite reconduction pour une période identique.
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">11.3 Résiliation (1 clic)</h3>
                  <p>
                    Le Client peut résilier à tout moment via une fonctionnalité de résiliation en 1 clic depuis l'application (ou, à défaut, par email).
                  </p>
                  <p className="mt-4">
                    Sauf dispositions impératives contraires (notamment B2C), la résiliation prend effet à la fin de la période d'abonnement en cours. Aucun remboursement n'est dû pour la période en cours, sous réserve du droit de rétractation B2C (article 12).
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Droit de rétractation (B2C uniquement)</h2>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">12.1 Principe</h3>
                  <p>
                    Le consommateur dispose d'un délai de 14 jours à compter de la conclusion du contrat pour exercer son droit de rétractation, sans avoir à motiver sa décision.
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">12.2 Exécution immédiate à la demande du consommateur</h3>
                  <p>
                    Si le consommateur demande l'accès immédiat au Service (exécution avant la fin du délai de rétractation), et exerce ensuite sa rétractation, il reste tenu au paiement d'un montant proportionnel au Service fourni jusqu'à la communication de sa décision de se rétracter.
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">12.3 Modalités</h3>
                  <p>
                    La rétractation s'exerce :
                  </p>
                  <ul className="list-disc pl-6 space-y-2 mt-2">
                    <li>par email à <a href="mailto:mathis@lexiapro.fr" className="text-blue-600 hover:underline">mathis@lexiapro.fr</a>, ou</li>
                    <li>via le formulaire-type (Annexe 1).</li>
                  </ul>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">12.4 Exclusions</h3>
                  <p>
                    Certaines exceptions légales peuvent s'appliquer (ex. service pleinement exécuté avant la fin du délai, sous conditions). Lorsque pertinent, LEXIA appliquera les règles impératives applicables.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Politique de remboursement</h2>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">13.1 B2B</h3>
                  <p>
                    Aucun remboursement n'est dû, sauf stipulation contraire expresse dans un devis/contrat particulier ou obligation légale impérative.
                  </p>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-4">13.2 B2C</h3>
                  <p>
                    Aucun remboursement n'est dû, sauf exercice du droit de rétractation dans les conditions de l'article 12 (avec prorata le cas échéant).
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">ANNEXE 1 — FORMULAIRE TYPE DE RÉTRACTATION (B2C)</h2>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <p className="mb-2">
                      <strong>À l'attention de :</strong>
                    </p>
                    <p className="mb-4">
                      LEXIA FRANCE — MAISON DE LA TECHNOPOLE 6 RUE LEONARD DE VINCI 53810 CHANGE<br />
                      Email : <a href="mailto:mathis@lexiapro.fr" className="text-blue-600 hover:underline">mathis@lexiapro.fr</a>
                    </p>
                    <p className="mb-4">
                      Je vous notifie par la présente ma rétractation du contrat portant sur la souscription au Service Gilbert :
                    </p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>Commandé le : …</li>
                      <li>Nom du consommateur : …</li>
                      <li>Adresse du consommateur : …</li>
                      <li>Email du compte : …</li>
                      <li>Date : …</li>
                      <li>Signature (si papier) : …</li>
                    </ul>
                  </div>
                </section>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default CGVPage;
