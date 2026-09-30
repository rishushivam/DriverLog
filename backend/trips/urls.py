from django.urls import path

from .views import TripCreateAPIView, geocode_suggest, health

urlpatterns = [
    path("trips/", TripCreateAPIView.as_view(), name="trip-create"),
    path("health/", health, name="health"),
    path("geocode-suggest/", geocode_suggest, name="geocode-suggest"),
]
