import dspy


class SpamClasif(dspy.Signature):
    """
    Classify the email as spam or not spam
    """

    subject: str = dspy.InputField()
    body: str = dspy.InputField()
    is_spam: bool = dspy.OutputField()


spam_classifier = dspy.Predict(SpamClasif)
